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
// Google Sheets functionality removed
const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");

const { handleInteractionError } = require('@/utils/globalErrorHandler');
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
 getCharacterInventoryCollection,
 transferCharacterInventoryToVillageShops,
} = require('@/database/db');
const dbConfig = require('@/config/database');
const {
 getVillageColorByName,
 getVillageEmojiByName,
 getAllVillages,
 isValidVillage,
} = require("../../modules/locationsModule");
const {
 handleCharacterBasedCommandsAutocomplete,
 handleAutocomplete,
 handleChangeJobNewJobAutocomplete,
 handleChangeVillageNewVillageAutocomplete,
} = require("../../handlers/autocompleteHandler");
const {
 canChangeJob,
 canChangeVillage,
 isUniqueCharacterName,
  convertCmToFeetInches,
} = require('@/utils/validation');
// Google Sheets functionality removed
const {
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

const Character = require('@/models/CharacterModel');
const User = require('@/models/UserModel');
const ItemModel = require('@/models/ItemModel');
const Mount = require('@/models/MountModel');
const { capitalizeVillageName } = require('@/utils/stringUtils');
// ============================================================================
// ------------------- Constants and Configuration -------------------
// Defining constant values such as default images, channel IDs, and emoji lists.
// ============================================================================

const DEFAULT_IMAGE_URL =
 "https://storage.googleapis.com/tinglebot/Graphics/border.png";
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
 // ------------------- Change Character Village Subcommand -------------------
  .addSubcommand((subcommand) =>
   subcommand
    .setName("changevillage")
    .setDescription(
     "Change the home village of your character (Costs 500 tokens, once per month)"
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
      .setName("newvillage")
      .setDescription("The new home village for your character")
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
  const subcommand = interaction.options.getSubcommand();

  try {
   switch (subcommand) {
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
    case "changevillage":
     await handleChangeVillage(interaction);
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
  } catch (error) {
   await handleInteractionError(error, interaction, {
     source: 'character.js',
     subcommand: interaction.options?.getSubcommand()
   });
  }
 },

 async autocomplete(interaction) {
  try {
   const subcommand = interaction.options.getSubcommand();
   const focusedOption = interaction.options.getFocused(true);

   switch (subcommand) {
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
     case "changevillage":
      if (focusedOption.name === "charactername") {
       await handleCharacterBasedCommandsAutocomplete(
        interaction,
        focusedOption,
        "changevillage"
       );
      } else if (focusedOption.name === "newvillage") {
       await handleChangeVillageNewVillageAutocomplete(interaction, focusedOption);
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

  // Google Sheets functionality removed
  // if (character.inventory && isValidGoogleSheetsUrl(character.inventory)) {
  //  try {
  //   const spreadsheetId = extractSpreadsheetId(character.inventory);
  //   await deleteInventorySheetData(spreadsheetId, characterName, {
  //     commandName: "delete",
  //     userTag: interaction.user.tag,
  //     userId: interaction.user.id,
  //     characterName: character.name,
  //     spreadsheetId: extractSpreadsheetId(character.inventory),
  //     range: 'loggedInventory!A2:M',
  //     sheetType: 'inventory',
  //     options: interaction.options.data
  //   });
  //  } catch (error) {
  //   handleInteractionError(error, interaction, {
  //     commandName: "delete",
  //     userTag: interaction.user.tag,
  //     userId: interaction.user.id,
  //     characterName: character.name,
  //     spreadsheetId: extractSpreadsheetId(character.inventory),
  //     range: 'loggedInventory!A2:M',
  //     sheetType: 'inventory',
  //     options: interaction.options.data
  //   });
  //   console.error(
  //    `❌ Failed to delete inventory data for character ${characterName}:`,
  //    error
  //   );
  //  }
  // }

  await connectToInventories();
  try {
   await transferCharacterInventoryToVillageShops(character.name);
  } catch (transferErr) {
   console.error(`[character.js]: Failed to transfer inventory to village shops for ${character.name}:`, transferErr.message);
  }
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
    console.log(`[handleChangeJob] Validation failed`);
    if (typeof jobValidation.message === 'string') {
      await interaction.followUp({
        content: jobValidation.message,
        ephemeral: true
      });
    } else {
      await interaction.followUp({
        embeds: [jobValidation.message],
        ephemeral: true
      });
    }
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
    console.log('[handleChangeJob] Failed to load user token balance');
    await interaction.followUp({
      content: "❌ Unable to load your token balance right now. Please try again in a moment.",
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

  // Compute newPerks here so it's in scope for character.jobPerk (used for both accepted and non-accepted)
  const newPerks = getJobPerk(newJob)?.perks || [];

  // ------------------- Update Discord Roles (only for approved characters) -------------------
  const isAccepted = character.status === 'accepted';
  if (isAccepted) {
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
      // Try to get vending URI from shared config first, then fall back to environment variables
      const vendingUri = dbConfig.vending 
        || (process.env.NODE_ENV === 'production' 
            ? process.env.MONGODB_VENDING_URI_PROD 
            : process.env.MONGODB_VENDING_URI_DEV)
        || process.env.MONGODB_VENDING_URI;

      if (!vendingUri) {
        console.warn('[handleChangeJob] Vending URI not configured. Skipping vending reset.');
        // Reset character vending fields even if database connection fails
        character.vendingPoints = 0;
        character.vendingSetup = null;
        character.vendingSync = false;
        character.shopLink = null;
        character.shopPouch = null;
        character.pouchSize = 0;
        character.vendorType = null;
        return; // Exit early without database operations
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

  // Deduct tokens only after job change completes successfully
  const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
  await updateTokenBalance(interaction.user.id, -500, {
    category: 'character',
    description: `Job change (${character.name}: ${previousJob} → ${newJob})`,
    link: interactionUrl
  });

  // Log to token tracker
  try {
    const user = await User.findOne({ discordId: interaction.user.id });
    // Google Sheets token tracker functionality removed
  } catch (sheetError) {
    console.error(`[handleChangeJob] ❌ Token tracker error:`, sheetError);
  }

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
// ------------------- Character Village Change Handler -------------------
// Processes the change of a character's home village with validation and token deduction.
// ============================================================================

async function handleChangeVillage(interaction) {
 console.log('[handleChangeVillage] Starting village change process');
 await interaction.deferReply();

 try {
  const userId = interaction.user.id;
  const characterName = interaction.options.getString("charactername");
  const newVillage = interaction.options.getString("newvillage");
  
  console.log(`[handleChangeVillage] Processing village change: ${characterName} -> ${newVillage} (User: ${userId})`);

  // ------------------- Village Validation -------------------
  if (!isValidVillage(newVillage)) {
    console.warn(`[handleChangeVillage] Invalid village: '${newVillage}' by user ${userId}`);
    await interaction.followUp({
      content: `❌ **${newVillage}** is not a valid village. Please select a valid village from the list.`,
      ephemeral: true
    });
    return;
  }

  await connectToTinglebot();
  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  
  if (!character) {
   console.log(`[handleChangeVillage] Character not found: ${characterName} (User: ${userId})`);
   await interaction.followUp({
    content: `❌ **Character \"${characterName}\"** not found or does not belong to you.`,
    ephemeral: true
   });
   return;
  }
  
  const previousVillage = character.homeVillage || "Unknown";

  // Add validation to prevent changing to current village
  if (previousVillage.toLowerCase() === newVillage.toLowerCase()) {
    console.log(`[handleChangeVillage] Same village attempt: ${previousVillage}`);
    await interaction.followUp({
      content: `❌ You cannot change your village to the same village you currently have (${previousVillage}).`,
      ephemeral: true
    });
    return;
  }

  const villageValidation = await canChangeVillage(character, newVillage);
  
  if (!villageValidation.valid) {
    console.log(`[handleChangeVillage] Validation failed: ${villageValidation.message}`);
    if (typeof villageValidation.message === 'string') {
      await interaction.followUp({
        content: villageValidation.message,
        ephemeral: true
      });
    } else {
      await interaction.followUp({
        embeds: [villageValidation.message],
        ephemeral: true
      });
    }
    return;
  }

  const lastVillageChange = character.lastVillageChange ? new Date(character.lastVillageChange) : null;
  const now = new Date();
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  if (lastVillageChange && lastVillageChange > oneMonthAgo) {
    const remainingDays = Math.ceil((lastVillageChange - oneMonthAgo) / (1000 * 60 * 60 * 24));
    console.log(`[handleChangeVillage] Cooldown active: ${remainingDays} days remaining`);
    await interaction.followUp({
      content: `⚠️ You can only change villages once per month. Please wait **${remainingDays}** more day(s).`,
      ephemeral: true
    });
    return;
  }

  const userTokens = await getOrCreateToken(interaction.user.id);
  
  if (!userTokens) {
    console.log('[handleChangeVillage] Failed to load user token balance');
    await interaction.followUp({
      content: "❌ Unable to load your token balance right now. Please try again in a moment.",
      ephemeral: true
    });
    return;
  }


  if (userTokens.tokens < 500) {
    console.log(`[handleChangeVillage] Insufficient tokens: ${userTokens.tokens}`);
    await interaction.followUp({
      content: `❌ You need **500 tokens** to change your character's village. Current balance: **${userTokens.tokens} tokens**.`,
      ephemeral: true
    });
    return;
  }

  console.log('[handleChangeVillage] Processing village change and deducting 500 tokens');
  const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
  await updateTokenBalance(interaction.user.id, -500, {
    category: 'character',
    description: `Village change (${character.name}: ${previousVillage} → ${newVillage})`,
    link: interactionUrl
  });

  // Token tracker logging removed - Google Sheets functionality no longer used

  character.homeVillage = newVillage;
  character.lastVillageChange = now;

  await character.save();

  const villageColor = getVillageColorByName(newVillage) || "#4CAF50";
  const villageEmoji = getVillageEmojiByName(newVillage) || "🏠";
  const nextVillageChangeDate = new Date();
  nextVillageChangeDate.setMonth(nextVillageChangeDate.getMonth() + 1);
  const formattedNextChangeDate = nextVillageChangeDate.toLocaleDateString(
   "en-US",
   {
    year: "numeric",
    month: "long",
    day: "numeric",
   }
  );
  
  const formattedPreviousVillage = capitalizeFirstLetter(previousVillage);
  const formattedNewVillage = capitalizeFirstLetter(newVillage);
  
  const embed = new EmbedBuilder()
   .setTitle(`${villageEmoji} Village Change Notification`)
   .setDescription(
    `Resident **${character.name}** has formally submitted their notice of village change from **${formattedPreviousVillage}** to **${formattedNewVillage}**.\n\n` +
     `The **${formattedNewVillage} Town Hall** welcomes you to your new home!\n\n` +
     `💰 **500 tokens deducted.**`
   )
   .addFields(
    { name: "👤 __Name__", value: character.name, inline: true },
    { name: "🏠 __New Home Village__", value: formattedNewVillage, inline: true },
    { name: "​", value: "​", inline: true },
    {
     name: "📅 __Last Village Change__",
     value: lastVillageChange ? lastVillageChange.toLocaleDateString() : "N/A",
     inline: true,
    },
    {
     name: "🔄 __Next Change Available__",
     value: formattedNextChangeDate,
     inline: true,
    }
   )
   .setColor(villageColor)
   .setThumbnail(character.icon && character.icon.startsWith('http') ? character.icon : DEFAULT_IMAGE_URL)
   .setImage(DEFAULT_IMAGE_URL)
   .setTimestamp();

  await interaction.followUp({ embeds: [embed] });
  
  console.log(`[handleChangeVillage] ✅ Village change completed: ${characterName} (${previousVillage} -> ${newVillage})`);
 } catch (error) {
  console.error('[handleChangeVillage] Error occurred:', error);
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