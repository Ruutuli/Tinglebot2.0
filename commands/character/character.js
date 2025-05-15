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
} = require("discord.js");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const { google } = require("googleapis");

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
} = require("../../database/db");
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
} = require("../../utils/validation");
const {
 appendSheetData,
 authorizeSheets,
 deleteInventorySheetData,
 safeAppendDataToSheet,
} = require("../../utils/googleSheetsUtils");
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
} = require("../../embeds/embeds");
const {
 getMountEmoji,
 getMountThumbnail,
} = require("../../modules/mountModule");
const bucket = require("../../config/gcsService");

const Character = require("../../models/CharacterModel");
const User = require("../../models/UserModel");
const ItemModel = require("../../models/ItemModel");
const Mount = require("../../models/MountModel");
const { capitalizeVillageName } = require('../../utils/stringUtils');

// ============================================================================
// ------------------- Constants and Configuration -------------------
// Defining constant values such as default images, channel IDs, and emoji lists.
// ============================================================================

const DEFAULT_IMAGE_URL =
 "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png";
const EDIT_NOTIFICATION_CHANNEL_ID = "1319524801408274434";
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
       ephemeral: true,
      });
    }
   }
  } catch (error) {
   handleError(error, "character.js");
   if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({
     content: "❌ An error occurred while processing your request.",
     ephemeral: true,
    });
   }
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
   handleError(error, "character.js");
   await interaction.respond([]);
   
  }
 },
};

// ============================================================================
// ------------------- Character Creation Handler -------------------
// Processes character creation, validation, and database updates.
// ============================================================================

async function handleCreateCharacter(interaction, subcommand) {
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
   await interaction.reply({
    content:
     "❌ You do not have enough character slots available to create a new character.",
    ephemeral: true,
   });
   return;
  }

  const characterName = interaction.options.getString("name");
  const existingCharacter = await Character.findOne({ name: characterName });

  if (existingCharacter) {
   await interaction.reply({
    content: `❌ A character with the name "${characterName}" already exists. Please choose a different name.`,
    ephemeral: true,
   });
   return;
  }

  // Validate numeric fields
  const age = interaction.options.getInteger("age");
  const hearts = interaction.options.getInteger("hearts");
  const stamina = interaction.options.getInteger("stamina");
  const height = interaction.options.getNumber("height");

  // Validate age
  if (age < 1) {
   await interaction.reply({
    content: "❌ Age must be a positive number.",
    ephemeral: true,
   });
   return;
  }

  // Validate hearts and stamina
  if (hearts < 1 || stamina < 1) {
   await interaction.reply({
    content: "❌ Hearts and stamina values must be positive numbers.",
    ephemeral: true,
   });
   return;
  }

  // Validate height
  if (isNaN(height) || height <= 0) {
   await interaction.reply({
    content: "❌ Height must be a positive number.",
    ephemeral: true,
   });
   return;
  }

  // Validate race
  const race = interaction.options.getString("race");
  if (!isValidRace(race)) {
   await interaction.reply({
    content: `❌ "${race}" is not a valid race. Please select a valid race from the autocomplete options.`,
    ephemeral: true,
   });
   return;
  }

  // Validate village (for general subcommand)
  const village = interaction.options.getString("village");
  if (subcommand === "general" && !["inariko", "rudania", "vhintl"].includes(village)) {
   await interaction.reply({
    content: `❌ "${village}" is not a valid village. Please select a valid village from the choices.`,
    ephemeral: true,
   });
   return;
  }

  // Validate job
  const job = interaction.options.getString("job");
  if (!job) {
   await interaction.reply({
    content: "❌ Please select a valid job from the choices.",
    ephemeral: true,
   });
   return;
  }

  // Validate inventory link
  const inventory = interaction.options.getString("inventory");
  if (!isValidGoogleSheetsUrl(inventory)) {
   await interaction.reply({
    content: "❌ Please provide a valid Google Sheets URL for the inventory.",
    ephemeral: true,
   });
   return;
  }

  // Validate app link
  const appLink = interaction.options.getString("applink");
  if (!appLink) {
   await interaction.reply({
    content: "❌ Please provide a valid application link.",
    ephemeral: true,
   });
   return;
  }

  // Validate icon
  const icon = interaction.options.getAttachment("icon");
  if (!icon) {
   await interaction.reply({
    content: "❌ Please provide a valid icon image.",
    ephemeral: true,
   });
   return;
  }

  const formattedRace = `Race: ${race}`;
  const formattedVillage = `${capitalizeFirstLetter(village)} Resident`;
  const formattedJob = `Job: ${capitalizeWords(job)}`;

  const { perks: jobPerks } = getJobPerk(job) || { perks: [] };

  const member = interaction.member;
  const roleNames = [formattedRace, formattedVillage, formattedJob];

  for (const roleName of roleNames) {
   const role = interaction.guild.roles.cache.find((r) => r.name === roleName);
   if (role) {
    await member.roles.add(role);
    console.log(
     `[Roles]: Assigned role "${roleName}" to user "${member.user.tag}".`
    );
   } else {
    console.warn(`[Roles]: Role "${roleName}" not found in the guild.`);
   }
  }

  for (const perk of jobPerks) {
   const perkRoleName = `Job Perk: ${perk}`;
   const perkRole = interaction.guild.roles.cache.find(
    (r) => r.name === perkRoleName
   );
   if (perkRole) {
    await member.roles.add(perkRole);
    console.log(
     `[Roles]: Assigned perk role "${perkRole.name}" to user "${member.user.tag}".`
    );
   } else {
    console.warn(
     `[Roles]: Perk role "${perkRoleName}" not found in the guild.`
    );
   }
  }

  user.characterSlot -= 1;
  await user.save();

  await createCharacterInteraction(interaction);

  await interaction.followUp({
   content:
    "🎉 Your character has been successfully created! Your remaining character slots: " +
    user.characterSlot,
   ephemeral: true,
  });
 } catch (error) {
  handleError(error, "character.js");
  console.error(
   "[CreateCharacter]: Error during character creation:",
   error.message
  );

  if (!interaction.replied && !interaction.deferred) {
   await interaction.reply({
    content:
     "❌ An error occurred during character creation. Please try again later.",
    ephemeral: true,
   });
  }
 }
}

// ============================================================================
// ------------------- Character Editing Handler -------------------
// Processes updates to existing characters including name, job, race, village, etc.
// ============================================================================


async function handleEditCharacter(interaction) {
 await interaction.deferReply({ ephemeral: true });

 try {
  const fullCharacterName = interaction.options.getString("charactername");
  const characterName = fullCharacterName?.split(' | ')[0];
  const category = interaction.options.getString("category");
  const updatedInfo = interaction.options.getString("updatedinfo");
  const userId = interaction.user.id;
  const newIcon = interaction.options.getAttachment("newicon");

  await connectToTinglebot();

  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) {
   await interaction.followUp({
    content: `❌ **Character ${characterName} not found or does not belong to you.**`,
    ephemeral: true,
   });
   return;
  }

  let updateMessage = "";
  let previousValue =
   character[category] !== undefined ? character[category] : "N/A";
  let updatedValue;

  if (["race", "homeVillage"].includes(category)) {
   const member = interaction.member;

   console.log(`[Roles]: Updating roles for user "${member.user.tag}".`);
   console.log(
    `[Roles]: Category to update: "${category}", Previous Value: "${previousValue}", Updated Value: "${updatedInfo}".`
   );

   const roleCategory = {
    race: "Races",
    homeVillage: "Villages",
   }[category];

   const roleToRemove = roles[roleCategory]?.find(
    (r) =>
     r.name ===
     (category === "homeVillage"
      ? `${previousValue} Resident`
      : `Race: ${previousValue}`)
   );
   const roleToAdd = roles[roleCategory]?.find(
    (r) =>
     r.name ===
     (category === "homeVillage"
      ? `${updatedInfo} Resident`
      : `Race: ${updatedInfo}`)
   );

   if (roleToRemove) {
    const role = interaction.guild.roles.cache.find(
     (r) => r.name === roleToRemove.name
    );
    if (role) {
     await member.roles.remove(role);
     console.log(
      `[Roles]: Removed role "${role.name}" from user "${member.user.tag}".`
     );
    } else {
     console.warn(
      `[Roles]: Role "${roleToRemove.name}" not found in the guild.`
     );
    }
   } else {
    console.log(`[Roles]: No role to remove for "${previousValue}".`);
   }

   if (roleToAdd) {
    const role = interaction.guild.roles.cache.find(
     (r) => r.name === roleToAdd.name
    );
    if (role) {
     await member.roles.add(role);
     console.log(
      `[Roles]: Assigned role "${role.name}" to user "${member.user.tag}".`
     );
    } else {
     console.warn(`[Roles]: Role "${roleToAdd.name}" not found in the guild.`);
    }
   } else {
    console.log(`[Roles]: No role to add for "${updatedInfo}".`);
   }
  }

  if (category === "job") {
   try {
    // Validate job exists
    if (!isValidJob(updatedInfo)) {
      await interaction.followUp({
        content: `❌ **${updatedInfo}** is not a valid job. Please select a valid job from the list.`,
        ephemeral: true,
      });
      return;
    }
    const validationResult = await canChangeJob(character, updatedInfo);

    if (!validationResult.valid) {
     console.warn(
      `[WARNING] Job validation failed: ${validationResult.message}`
     );
     await interaction.followUp({
      content: validationResult.message,
      ephemeral: true,
     });
     return;
    }

    if (
     [
      "General Jobs",
      "Inariko Exclusive Jobs",
      "Rudania Exclusive Jobs",
      "Vhintl Exclusive Jobs",
     ].includes(updatedInfo)
    ) {
     await handleJobCategorySelection(interaction, character, updatedInfo);
     return;
    }

    character.job = updatedInfo;
    console.log(
     `[INFO] Job successfully updated for character ${character.name} from ${previousValue} to ${updatedInfo}`
    );
    updateMessage = `✅ **${character.name}'s job has been updated from ${previousValue} to ${updatedInfo}.**`;
   } catch (error) {
    handleError(error, "character.js");
    console.error(
     `[ERROR] An error occurred while processing job update: ${error.message}`
    );
    console.error(error.stack);
    await interaction.followUp({
     content:
      "⚠️ An unexpected error occurred while updating the job. Please try again later.",
     ephemeral: true,
    });
   }
  } else if (category === "homeVillage") {
   const validationResult = await canChangeVillage(character, updatedInfo);
   if (!validationResult.valid) {
    await interaction.followUp({
     content: validationResult.message,
     ephemeral: true,
    });
    return;
   }
   character.homeVillage = updatedInfo;
   character.currentVillage = updatedInfo;
   updateMessage = `✅ **${character.name}'s village has been updated from ${capitalizeVillageName(previousValue)} to ${capitalizeVillageName(updatedInfo)}.**`;
  } else if (category === "name") {
   const uniqueNameCheck = await isUniqueCharacterName(
    character.userId,
    updatedInfo
   );
   if (!uniqueNameCheck) {
    await interaction.followUp({
     content: `⚠️ **${updatedInfo}** is already in use by another character. Please choose a different name.`,
     ephemeral: true,
    });
    return;
   }

   const previousName = character.name;
   character.name = updatedInfo;
   const { updatedValue } = capturePreviousAndUpdatedValues(
    character,
    category,
    updatedInfo
   );

   updateMessage = `✅ **${character.name}'s name has been updated from ${previousName} to ${updatedValue}.**`;

   await deleteCharacterInventoryCollection(previousName);
   await createCharacterInventory(character.name, character._id, character.job);
  } else if (category === "hearts") {
   const hearts = parseInt(updatedInfo, 10);

   if (isNaN(hearts) || hearts < 0) {
    await interaction.followUp({
     content: `⚠️ **${updatedInfo}** is not valid for hearts. Please provide a non-negative number.`,
     ephemeral: true,
    });
    return;
   }

   previousValue = character.currentHearts;
   await updateHearts(character._id, hearts);

   character.currentHearts = hearts;
   character.maxHearts = hearts;

   updatedValue = hearts;
   updateMessage = `✅ **${character.name}'s hearts have been updated from ${previousValue} to ${hearts}.**`;
  } else if (category === "stamina") {
   const stamina = parseInt(updatedInfo, 10);

   if (isNaN(stamina) || stamina < 0) {
    await interaction.followUp({
     content: `⚠️ **${updatedInfo}** is not valid for stamina. Please provide a non-negative number.`,
     ephemeral: true,
    });
    return;
   }

   previousValue = character.currentStamina;
   await updateStamina(character._id, stamina);

   character.currentStamina = stamina;
   character.maxStamina = stamina;

   updatedValue = stamina;
   updateMessage = `✅ **${character.name}'s stamina have been updated from ${previousValue} to ${stamina}.**`;
  } else if (category === "pronouns") {
   character.pronouns = updatedInfo;
   updateMessage = `✅ **${character.name}'s pronouns have been updated from ${previousValue} to ${updatedInfo}.**`;
  } else if (category === "race") {
   if (!isValidRace(updatedInfo)) {
    await interaction.followUp({
     content: `⚠️ **${updatedInfo}** is not a valid race.`,
     ephemeral: true,
    });
    return;
   }
   character.race = updatedInfo;
   updateMessage = `✅ **${character.name}'s race has been updated from ${previousValue} to ${updatedInfo}.**`;
  } else if (category === "icon") {
   if (newIcon) {
    try {
     const response = await axios.get(newIcon.url, {
      responseType: "arraybuffer",
     });
     const iconData = Buffer.from(response.data, "binary");
     const blob = bucket.file(uuidv4() + path.extname(newIcon.name));
     const blobStream = blob.createWriteStream({ resumable: false });
     blobStream.end(iconData);

     await new Promise((resolve, reject) => {
      blobStream.on("finish", resolve);
      blobStream.on("error", reject);
     });

     const publicIconUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
     character.icon = publicIconUrl;
     updateMessage = `✅ **${character.name}'s icon has been updated.**`;
    } catch (error) {
     handleError(error, "character.js");
     await interaction.followUp({
      content: `⚠️ **There was an error uploading the icon: ${error.message}**`,
      ephemeral: true,
     });
     return;
    }
   } else {
    await interaction.followUp({
     content: "⚠️ **Please provide a valid icon attachment.**",
     ephemeral: true,
    });
    return;
   }
  } else if (category === "app_link") {
   previousValue = character.appLink || "N/A";
   updatedValue = updatedInfo || "N/A";

   character.appLink = updatedInfo;
   updateMessage = `✅ **${character.name}'s application link has been updated from ${previousValue} to ${updatedValue}.**`;
  } else if (category === "inventory") {
   const { previousValue, updatedValue } = capturePreviousAndUpdatedValues(
    character,
    category,
    updatedInfo
   );

   character.inventory = updatedValue;
   updateMessage = `✅ **${character.name}'s inventory link has been updated from ${previousValue} to ${updatedValue}.**`;
  } else if (category === "age") {
   const age = parseInt(updatedInfo, 10);

   if (isNaN(age) || age < 0) {
    await interaction.followUp({
     content: `⚠️ **${updatedInfo}** is not a valid age. Please provide a non-negative number.`,
     ephemeral: true,
    });
    return;
   }

   const { previousValue, updatedValue } = capturePreviousAndUpdatedValues(
    character,
    category,
    updatedInfo
   );

   character.age = updatedValue;
   updateMessage = `✅ **${character.name}'s age has been updated from ${previousValue} to ${updatedValue}.**`;
  } else if (category === "height") {
    const heightInCm = parseFloat(updatedInfo);
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

  await character.save();

  const updatedCharacter = await fetchCharacterById(character._id);

  const embed = createCharacterEmbed(updatedCharacter);

  try {
   const notificationChannel = await interaction.client.channels.fetch(
    EDIT_NOTIFICATION_CHANNEL_ID
   );
   if (notificationChannel && notificationChannel.isTextBased()) {
    const notificationMessage = `📢 **USER EDITED THEIR CHARACTER**\n
  🌱 **User:** \`${interaction.user.tag}\` 
  👤 **Character Name:** \`${character.name}\`
  🛠️ **Edited Category:** \`${category}\`
  🔄 **Previous Value:** \`${previousValue || "N/A"}\`
  ✅ **Updated Value:** \`${
   updatedValue || updatedCharacter[category] || "N/A"
  }\``;

    await notificationChannel.send(notificationMessage);
   } else {
    console.error(
     `[character.js]: Notification channel is not text-based or unavailable.`
    );
   }
  } catch (err) {
   handleError(err, "character.js");
   console.error(
    `[character.js]: Error sending update notification: ${err.message}`
   );
  }

  await interaction.followUp({
   content: updateMessage,
   embeds: [embed],
   ephemeral: true,
  });
 } catch (error) {
  handleError(error, "character.js");
  await interaction.followUp({
   content: `⚠️ **There was an error updating the character: ${error.message}**`,
   ephemeral: true,
  });
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
    content: `❌ Character **${characterName}** not found or does not belong to you.`,
    ephemeral: true,
   });
   return;
  }

  const settings = getCommonEmbedSettings(character);

  const characterEmbed = createCharacterEmbed(character);

  const itemNames = [
   character.gearWeapon?.name,
   character.gearShield?.name,
   character.gearArmor?.head?.name,
   character.gearArmor?.chest?.name,
   character.gearArmor?.legs?.name,
  ].filter(Boolean);

  const itemDetails = await ItemModel.find({ itemName: { $in: itemNames } });

  const getItemDetail = (itemName) => {
   const item = itemDetails.find((detail) => detail.itemName === itemName);
   return item
    ? `${item.emoji} ${item.itemName} [+${item.modifierHearts}]`
    : "N/A";
  };

  const gearMap = {
   head: character.gearArmor?.head
    ? `> ${getItemDetail(character.gearArmor.head.name)}`
    : "> N/A",
   chest: character.gearArmor?.chest
    ? `> ${getItemDetail(character.gearArmor.chest.name)}`
    : "> N/A",
   legs: character.gearArmor?.legs
    ? `> ${getItemDetail(character.gearArmor.legs.name)}`
    : "> N/A",
   weapon: character.gearWeapon
    ? `> ${getItemDetail(character.gearWeapon.name)}`
    : "> N/A",
   shield: character.gearShield
    ? `> ${getItemDetail(character.gearShield.name)}`
    : "> N/A",
  };

  const gearEmbed = createCharacterGearEmbed(character, gearMap, "all");

  const jobPerkInfo = getJobPerk(character.job);
  const embeds = [characterEmbed, gearEmbed];

  if (jobPerkInfo?.perks.includes("VENDING") && character.vendorType) {
   const vendorEmbed = createVendorEmbed(character);
   if (vendorEmbed) embeds.push(vendorEmbed);
  }

  const mount = await Mount.findOne({ characterId: character._id });
  if (mount) {
   const speciesEmoji = getMountEmoji(mount.species);
   const formattedTraits =
    mount.traits && mount.traits.length
     ? mount.traits.map((trait) => `> ${trait}`).join("\n")
     : "No traits available";

   const mountEmbed = {
    title: `${speciesEmoji} **${mount.name}** - Mount Details`,
    description: `✨ **Mount Stats for**: **${character.name}**`,
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
     url: "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png",
    },
    footer: {
     text: `${character.name}'s Mount Stats`,
     iconURL: character.icon,
    },
    timestamp: new Date(),
   };

   embeds.push(mountEmbed);
  }

  await interaction.reply({ embeds, ephemeral: true });
 } catch (error) {
  handleError(error, "character.js");
  console.error("Error executing viewcharacter command:", error);
  await interaction.reply({
   content: "❌ An error occurred while fetching the character.",
   ephemeral: true,
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
    ephemeral: true,
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
    "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png"
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

  await interaction.reply({ embeds: [embed], components: rows });
 } catch (error) {
  handleError(error, "character.js");
  await interaction.reply({
   content: `❌ Error retrieving character list.`,
   ephemeral: true,
  });
 }
}

// ============================================================================
// ------------------- Character Deletion Handler -------------------
// Handles the deletion of a character and cleanup of associated data and roles.
// ============================================================================


async function handleDeleteCharacter(interaction) {
 await interaction.deferReply({ ephemeral: true });

 try {
  const characterName = interaction.options.getString("charactername");
  const userId = interaction.user.id;

  await connectToTinglebot();

  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) {
   await interaction.editReply({
    content: `❌ **Character not found**: **${characterName}** does not exist or does not belong to you.`,
    ephemeral: true,
   });
   return;
  }

  if (character.inventory && isValidGoogleSheetsUrl(character.inventory)) {
   try {
    const spreadsheetId = extractSpreadsheetId(character.inventory);
    await deleteInventorySheetData(spreadsheetId, characterName);
   } catch (error) {
    handleError(error, "character.js");
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
  await interaction.editReply({
   content: `✅ **Character deleted**: **${characterName}** has been successfully removed.`,
   ephemeral: true,
  });
 } catch (error) {
  handleError(error, "character.js");
  await interaction.editReply({
   content: `❌ **An error occurred while deleting the character**: ${error.message}`,
   ephemeral: true,
  });
 }
}

// ============================================================================
// ------------------- Character Job Change Handler -------------------
// Processes the change of a character's job with validation and token deduction.
// ============================================================================


async function handleChangeJob(interaction) {
 await interaction.deferReply({ ephemeral: false });

 try {
  const userId = interaction.user.id;
  const characterName = interaction.options.getString("charactername");
  const newJob = interaction.options.getString("newjob");

  await connectToTinglebot();

  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) {
   return interaction.followUp({
    content: `❌ **Character \"${characterName}\"** not found or does not belong to you.`,
    ephemeral: true,
   });
  }
  const previousJob = character.job || "Unknown";

  const jobValidation = await canChangeJob(character, newJob);
  if (!jobValidation.valid) {
   return interaction.followUp({
    content: jobValidation.message,
    ephemeral: false,
   });
  }

  const currentTime = Date.now();
  const oneMonth = 30 * 24 * 60 * 60 * 1000;
  const lastJobChangeDate = character.jobDateChanged || 0;

  if (currentTime - new Date(lastJobChangeDate).getTime() < oneMonth) {
   const remainingDays = Math.ceil(
    (oneMonth - (currentTime - new Date(lastJobChangeDate).getTime())) /
     (24 * 60 * 60 * 1000)
   );
   return interaction.followUp({
    content: `⚠️ You can only change jobs once per month. Please wait **${remainingDays}** more day(s).`,
    ephemeral: true,
   });
  }

  const userTokens = await getOrCreateToken(userId);
  // Check for valid/synced Token Tracker before checking token balance
  if (!userTokens.tokenTracker || !isValidGoogleSheetsUrl(userTokens.tokenTracker)) {
    return interaction.followUp({
      content: "❌ You do not have a Token Tracker set up. Please use `/tokens setup` first.",
      ephemeral: true,
    });
  }
  if (userTokens.tokens < 500) {
   return interaction.followUp({
    content: `❌ You need **500 tokens** to change your character's job. Current balance: **${userTokens.tokens} tokens**.`,
    ephemeral: true,
   });
  }

  await updateTokenBalance(userId, -500);

  if (userTokens.tokenTracker) {
    try {
      const spreadsheetId = extractSpreadsheetId(userTokens.tokenTracker);
      const auth = await authorizeSheets();
      
      // Pre-validate the sheet before attempting to write
      try {
        const sheets = google.sheets({ version: 'v4', auth });
        const response = await sheets.spreadsheets.get({
          spreadsheetId,
          ranges: ['loggedTracker!A1:Z1'] // Check if tab exists
        });
        
        // Check if loggedTracker tab exists
        const hasLoggedTrackerTab = response.data.sheets.some(sheet => 
          sheet.properties.title.toLowerCase() === 'loggedtracker'
        );
        
        if (!hasLoggedTrackerTab) {
          return interaction.followUp({
            content: "❌ Token tracker sheet is missing the required tab.\n\n" +
              "The tab must be named exactly `loggedTracker` (case sensitive).\n" +
              "Current tabs found: " + response.data.sheets.map(s => s.properties.title).join(', ') + "\n\n" +
              "Please use `/tokens setup` to get a fresh template with the correct tab structure.",
            ephemeral: true
          });
        }
      } catch (validationError) {
        if (validationError.message.includes('does not have permission')) {
          return interaction.followUp({
            content: "❌ Permission denied for token tracker sheet.\n\n" +
              "The bot cannot access your token tracker sheet. Please:\n" +
              "1. Open your token tracker sheet\n" +
              "2. Click 'Share' in the top right\n" +
              "3. Add this email as an Editor: `tinglebot@rotw-tinglebot.iam.gserviceaccount.com`\n" +
              "4. Make sure to give it Editor access (not just Viewer)\n\n" +
              "You can use `/tokens setup` to get a fresh template with proper permissions.",
            ephemeral: true
          });
        }
        throw validationError;
      }

      const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
      const tokenRow = [
        `${character.name} - Job Change`,
        interactionUrl,
        "Other",
        "spent",
        `-500`,
      ];
      await safeAppendDataToSheet(userTokens.tokenTracker, character, "loggedTracker!B7:F", [tokenRow]);
    } catch (error) {
      // Log the specific error for debugging
      console.error(`[Token Tracker Error] Details:`, {
        error: error.message,
        spreadsheetId: extractSpreadsheetId(userTokens.tokenTracker),
        characterName: character.name,
        userId: userId,
        stack: error.stack,
        code: error.code,
        status: error.status,
        details: error.errors
      });

      // Check if the error is related to range parsing
      if (error.message.includes('Unable to parse range')) {
        return interaction.followUp({
          content: "❌ Token tracker sheet has incorrect tab name.\n\n" +
            "The tab must be named exactly `loggedTracker` (case sensitive).\n" +
            "Please check for any extra spaces or different capitalization.\n\n" +
            "You can use `/tokens setup` to get a fresh template with the correct tab structure.",
          ephemeral: true
        });
      }

      // Generic error message for other cases
      return interaction.followUp({
        content: "❌ Failed to log token transaction. Please check:\n\n" +
          "1. Your token tracker sheet exists and is accessible\n" +
          "2. The sheet has a tab named exactly `loggedTracker` (case sensitive)\n" +
          "3. The sheet is shared with editor access to: `tinglebot@rotw-tinglebot.iam.gserviceaccount.com`\n\n" +
          "You can use `/tokens setup` to reconfigure your token tracker sheet.",
        ephemeral: true
      });
    }
  }

  character.job = newJob;
  character.lastJobChange = currentTime;
  character.jobDateChanged = new Date(currentTime);

  character.jobHistory = character.jobHistory || [];
  character.jobHistory.push({
   job: newJob,
   changedAt: new Date(currentTime),
  });

  // ------------------- Reset Vending on Invalid Job -------------------
  const nonVendor = !["merchant", "shopkeeper"].includes(newJob.toLowerCase());
  if (nonVendor) {
    try {
      const vendingClient = new MongoClient(process.env.MONGODB_VENDING_URI);
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
      character.vendingType = null;

      await vendingClient.close();

      console.log(`[handleChangeJob] Cleared vending stock and reset points for ${character.name}`);
    } catch (err) {
      console.error(`[handleChangeJob] Failed to reset vending data for ${character.name}:`, err);
    }
  }

  await character.save();

  const villageColor = getVillageColorByName(character.homeVillage) || "#4CAF50";
  const villageEmoji = getVillageEmojiByName(character.homeVillage) || "\ud83c\udfe1";
  const nextJobChangeDate = new Date(currentTime + oneMonth).toLocaleDateString(
   "en-US",
   {
    year: "numeric",
    month: "long",
    day: "numeric",
   }
  );
  
  // capitalize homeVillage properly before inserting
  const formattedHomeVillage = capitalizeFirstLetter(character.homeVillage);
  
  const embed = new EmbedBuilder()
   .setTitle(`${villageEmoji} Job Change Notification`)
   .setDescription(
    `Resident **${character.name}** has formally submitted their notice of job change from **${previousJob}** to **${newJob}**.\n\n` +
     `The **${formattedHomeVillage} Town Hall** wishes you the best in your new endeavors!`
   )
   .addFields(
    { name: "\ud83d\udc64 __Name__", value: character.name, inline: true },
    { name: "\ud83c\udfe1 __Home Village__", value: character.homeVillage, inline: true },
    { name: "​", value: "​", inline: true },
    {
     name: "\ud83d\udcc5 __Last Job Change__",
     value: new Date(character.jobDateChanged).toLocaleDateString(),
     inline: true,
    },
    {
     name: "\ud83d\udd04 __Next Change Available__",
     value: nextJobChangeDate,
     inline: true,
    }
   )
   .setColor(villageColor)
   .setThumbnail(character.icon)
   .setImage(DEFAULT_IMAGE_URL)
   .setTimestamp();

  return interaction.followUp({ embeds: [embed], ephemeral: false });
 } catch (error) {
  handleError(error, "character.js");
  console.error("[changejob.js]: Error changing job:", error);
  return interaction.followUp({
   content:
    "❌ An error occurred while processing your request. Please try again later.",
   ephemeral: false,
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

  if (!/^\d{2}-\d{2}$/.test(birthday)) {
   return interaction.reply({
    content:
     "❌ Invalid date format. Please provide the birthday in **MM-DD** format.",
    ephemeral: true,
   });
  }

  await connectToTinglebot();

  const character = await fetchCharacterByNameAndUserId(characterName, userId);

  if (!character) {
   await interaction.reply({
    content: `❌ Character **${characterName}** not found or does not belong to you.`,
    ephemeral: true,
   });
   return;
  }

  character.birthday = birthday;
  await character.save();

  await interaction.reply({
   content: `🎂 **${character.name}'s** birthday has been set to **${birthday}**.`,
   ephemeral: true,
  });
 } catch (error) {
  handleError(error, "character.js");
  await interaction.reply({
   content:
    "❌ An error occurred while setting the birthday. Please try again later.",
   ephemeral: true,
  });
 }
}

// ============================================================================
// ------------------- Utility Helper Functions -------------------
// Small helper functions for repetitive operations like value tracking and job selection UI.
// ============================================================================


function capturePreviousAndUpdatedValues(character, category, updatedInfo) {
 const previousValue =
  character[category] !== undefined ? character[category] : "N/A";
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

 const embedColor =
  getVillageColorByName(updatedInfo.split(" ")[0]) || "#00CED1";
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

 await interaction.followUp({ embeds: [embed], components, ephemeral: true });

 console.log(
  `[Job Selection]: Job selection buttons sent for user "${interaction.user.tag}".`
 );
}
