// ============================================================================
// ------------------- Imports -------------------
// Grouped and alphabetized within each section
// ============================================================================

// ------------------- Node.js Standard Libraries -------------------
const fs = require('fs');
const path = require('path');

// ------------------- Discord.js Components -------------------
const {
  EmbedBuilder,
  PermissionsBitField,
  SlashCommandBuilder
} = require('discord.js');

// ------------------- Database Connections -------------------
const {
  connectToInventories,
  connectToTinglebot
} = require('../../database/db');

// ------------------- Database Services -------------------
const {
  appendEarnedTokens,
  createCharacterInventory,
  deleteCharacterInventoryCollection,
  fetchAllCharacters,
  fetchAllItems,
  fetchAllMonsters,
  fetchCharacterById,
  fetchCharacterByName,
  fetchItemByName,
  fetchItemRarityByName,
  fetchItemsByCategory,
  fetchItemsByIds,
  fetchMonsterByName,
  fetchValidWeaponSubtypes,
  forceResetPetRolls,
  getCharacterInventoryCollection,
  getIngredientItems,
  getOrCreateToken,
  getSpecificItems,
  resetPetRollsForAllCharacters,
  updatePetToCharacter,
  updateTokenBalance
} = require('../../database/db');

// ------------------- Custom Modules -------------------
const { monsterMapping } = require('../../models/MonsterModel');

// ------------------- Utility Functions -------------------
const { handleError } = require('../../utils/globalErrorHandler');
const { addItemInventoryDatabase } = require('../../utils/inventoryUtils');
const {
  authorizeSheets,
  extractSpreadsheetId,
  isValidGoogleSheetsUrl,
  safeAppendDataToSheet
} = require('../../utils/googleSheetsUtils');
const {
  deletePendingEditFromStorage,
  deleteSubmissionFromStorage,
  retrievePendingEditFromStorage,
  retrieveSubmissionFromStorage,
  savePendingEditToStorage
} = require('../../utils/storage');

// ------------------- Modules -------------------
const {
  capitalize,
  capitalizeFirstLetter,
  capitalizeWords,
  getRandomColor
} = require('../../modules/formattingModule');

const {
  getMountEmoji,
  getMountThumbnail,
  getRandomMount,
  storeEncounter
} = require('../../modules/mountModule');

const {
  getVillageColorByName,
  getVillageEmojiByName
} = require('../../modules/locationsModule');

const {
  createRaidEmbed,
  startRaid,
  triggerRaid
} = require('../../modules/raidModule');

// ------------------- Handlers -------------------
const {
  handleAutocomplete,
  handleModCharacterAutocomplete,
  handleModGiveCharacterAutocomplete,
  handleModGiveItemAutocomplete
} = require('../../handlers/autocompleteHandler');

const { simulateWeightedWeather } = require('../../handlers/weatherHandler');

// ------------------- Database Models -------------------
const Character = require('../../models/CharacterModel');
const ItemModel = require('../../models/ItemModel');
const Pet = require('../../models/PetModel');
const TempData = require('../../models/TempDataModel');
const User = require('../../models/UserModel');
const VillageShopsModel = require('../../models/VillageShopsModel');

// ------------------- External API Integrations -------------------
const bucket = require('../../config/gcsService');

// ------------------- Embeds -------------------
const {
  createCharacterEmbed,
  createCharacterGearEmbed,
  createVendorEmbed,
  getCommonEmbedSettings
} = require('../../embeds/embeds');

const { createMountEncounterEmbed } = require('../../embeds/embeds');
const { generateWeatherEmbed } = require('../../embeds/weatherEmbed.js');

// ------------------- Third-Party Libraries -------------------
const { v4: uuidv4 } = require('uuid');


// ============================================================================
// ------------------- URL Utility Functions -------------------
// Consolidated URL handling for validation, cleaning, and sanitization
// ============================================================================

// ------------------- Function: validateAndSanitizeUrl -------------------
// Validates, cleans, and sanitizes URLs with fallback to placeholder
function validateAndSanitizeUrl(url, fallbackUrl = "https://i.imgur.com/placeholder.png") {
  if (!url) return fallbackUrl;
  
  try {
    // Clean the URL by removing trailing semicolons, spaces, and invalid characters
    let cleaned = url.replace(/[;\s]+$/, '').trim();
    cleaned = cleaned.replace(/;+$/, '');
    
    // Encode the URL properly
    const encodedUrl = encodeURI(cleaned).replace(/!/g, '%21');
    
    // Validate the URL structure
    const urlObj = new URL(encodedUrl);
    
    // Only allow http and https protocols
    if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
      console.log(`[mod.js]: ✅ URL validated and sanitized: "${url}" -> "${encodedUrl}"`);
      return encodedUrl;
    } else {
      console.warn(`[mod.js]: ⚠️ Invalid protocol for URL: ${url}`);
      return fallbackUrl;
    }
  } catch (error) {
    console.error(`[mod.js]: ❌ Error processing URL: ${url}`, error.message);
    return fallbackUrl;
  }
}

// ------------------- Function: isValidUrl -------------------
// Simple URL validation without sanitization
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// ------------------- Function: encodePetImageUrl -------------------
// Encodes pet image URLs by splitting and encoding filename separately
function encodePetImageUrl(petImageUrl) {
  if (!petImageUrl) return null;
  
  try {
    // Split the URL into base and filename parts
    const lastSlashIndex = petImageUrl.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
      const baseUrl = petImageUrl.substring(0, lastSlashIndex + 1);
      const filename = petImageUrl.substring(lastSlashIndex + 1);
      const encodedFilename = encodeURIComponent(filename);
      const encodedUrl = baseUrl + encodedFilename;
      console.log(`[mod.js]: Encoded pet image URL: "${petImageUrl}" -> "${encodedUrl}"`);
      return encodedUrl;
    }
  } catch (error) {
    console.log(`[mod.js]: Error encoding pet image URL: ${error.message}`);
  }
  return null;
}

// ------------------- Embed Footer Update Helper -------------------
async function updateSubmissionEmbedFooter(message, status, moderatorTag, reason = null) {
  try {
    const embed = message.embeds[0];
    if (!embed) {
      console.warn('[mod.js]: No embed found in message to update footer');
      return;
    }

    const updatedEmbed = embed.toJSON();
    let footerText = '';
    
    if (status === 'approved') {
      footerText = `✅ Approved by ${moderatorTag}`;
    } else if (status === 'denied') {
      footerText = `❌ Denied by ${moderatorTag}${reason ? ` - ${reason}` : ''}`;
    } else {
      footerText = `⏳ Please wait for a mod to approve your submission!`;
    }

    updatedEmbed.footer = {
      text: footerText,
      iconURL: undefined
    };

    await message.edit({ embeds: [updatedEmbed] });
    console.log(`[mod.js]: ✅ Updated embed footer to: ${footerText}`);
  } catch (error) {
    console.error(`[mod.js]: ❌ Error updating embed footer:`, error);
    handleError(error, 'mod.js');
  }
}

// ============================================================================
// ------------------- Submission Embed Creation Functions -------------------
// Consolidated embed creation for submission approval/denial notifications
// ============================================================================

// ------------------- Function: createSubmissionEmbed -------------------
// Creates submission-related embeds with consistent styling and structure
function createSubmissionEmbed(type, options = {}) {
  const {
    submissionId,
    title = 'Untitled',
    tokenAmount = 0,
    userId = null,
    reason = null,
    collab = null,
    isCollaboration = false
  } = options;

  const embedConfigs = {
    approval: {
      color: '#00FF00',
      title: '🎉 Submission Approved!',
      description: 'Your submission has been approved and tokens have been added to your balance.',
      footer: 'Submission Approval',
      fields: [
        { name: '📝 Submission ID', value: `\`${submissionId}\``, inline: true },
        { name: '🎨 Title', value: title, inline: true },
        { name: '💰 Tokens Earned', value: `**${tokenAmount}** tokens`, inline: true },
        { name: '🤝 Collaboration', value: isCollaboration ? 'Yes - tokens split' : 'No', inline: true }
      ]
    },
    collaboration: {
      color: '#00FF00',
      title: '🎉 Collaboration Submission Approved!',
      description: 'A submission you collaborated on has been approved and tokens have been added to your balance.',
      footer: 'Collaboration Submission Approval',
      fields: [
        { name: '📝 Submission ID', value: `\`${submissionId}\``, inline: true },
        { name: '🎨 Title', value: title, inline: true },
        { name: '💰 Tokens Earned', value: `**${tokenAmount}** tokens (split)`, inline: true }
      ]
    },
    denial: {
      color: '#FF0000',
      title: '❌ Submission Denied',
      description: 'Your submission has been denied. Please review the feedback and resubmit if needed.',
      footer: 'Submission Denial',
      fields: [
        { name: '📝 Submission ID', value: `\`${submissionId}\``, inline: true },
        { name: '🎨 Title', value: title, inline: true },
        { name: '📋 Reason', value: reason || 'No reason provided', inline: false }
      ]
    },
    modApproval: {
      color: '#00FF00',
      title: '✅ Submission Approved Successfully',
      description: `<@${userId}>, your submission has been approved!`,
      footer: 'Moderator Approval',
      fields: [
        { name: '📝 Submission ID', value: `\`${submissionId}\``, inline: true },
        { name: '🎨 Title', value: title, inline: true },
        { name: '💰 Tokens Awarded', value: `**${tokenAmount}** tokens`, inline: true },
        { name: '🤝 Collaboration', value: collab ? `Yes - split with ${collab}` : 'No', inline: true }
      ]
    },
    modDenial: {
      color: '#FF0000',
      title: '❌ Submission Denied Successfully',
      description: `<@${userId}>, your submission has been denied.`,
      footer: 'Moderator Denial',
      fields: [
        { name: '📝 Submission ID', value: `\`${submissionId}\``, inline: true },
        { name: '🎨 Title', value: title, inline: true },
        { name: '📋 Reason', value: reason || 'No reason provided', inline: false }
      ]
    }
  };

  const config = embedConfigs[type];
  if (!config) {
    throw new Error(`Invalid embed type: ${type}`);
  }

  const embed = new EmbedBuilder()
    .setColor(config.color)
    .setTitle(config.title)
    .setDescription(config.description)
    .addFields(config.fields)
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .setFooter({ text: config.footer })
    .setTimestamp();

  return embed;
}

// ------------------- Function: createApprovalDMEmbed -------------------
// Creates approval DM embed for users
function createApprovalDMEmbed(submissionId, title, tokenAmount, isCollaboration = false) {
  return createSubmissionEmbed('approval', { submissionId, title, tokenAmount, isCollaboration });
}

// ------------------- Function: createCollaborationApprovalDMEmbed -------------------
// Creates collaboration approval DM embed for users
function createCollaborationApprovalDMEmbed(submissionId, title, tokenAmount) {
  return createSubmissionEmbed('collaboration', { submissionId, title, tokenAmount });
}

// ------------------- Function: createDenialDMEmbed -------------------
// Creates denial DM embed for users
function createDenialDMEmbed(submissionId, title, reason) {
  return createSubmissionEmbed('denial', { submissionId, title, reason });
}

// ------------------- Function: createModApprovalConfirmationEmbed -------------------
// Creates mod approval confirmation embed
function createModApprovalConfirmationEmbed(submissionId, title, tokenAmount, userId, collab) {
  return createSubmissionEmbed('modApproval', { submissionId, title, tokenAmount, userId, collab });
}

// ------------------- Function: createModDenialConfirmationEmbed -------------------
// Creates mod denial confirmation embed
function createModDenialConfirmationEmbed(submissionId, title, userId, reason) {
  return createSubmissionEmbed('modDenial', { submissionId, title, userId, reason });
}

// ============================================================================
// ------------------- Pet Embed Creation Functions -------------------
// Consolidated embed creation for pet-related notifications
// ============================================================================

// ------------------- Function: createPetEmbed -------------------
// Creates pet-related embeds with consistent styling and structure
function createPetEmbed(type, options = {}) {
  const {
    character,
    pet,
    petName,
    oldLevel,
    newLevel,
    result,
    moderatorTag
  } = options;

  const embedConfigs = {
    levelUpdate: {
      title: "🎉 Pet Level Updated!",
      description: "Your pet has been upgraded by a moderator!",
      fields: [
        { name: "🐾 Pet Name", value: `> ${petName}`, inline: true },
        { name: "🦊 Species", value: `> ${pet.species}`, inline: true },
        { name: "🎯 Pet Type", value: `> ${pet.petType}`, inline: true },
        { name: "📈 Level Change", value: `> Level ${oldLevel} → **Level ${newLevel}**`, inline: true },
        { name: "🎲 Weekly Rolls", value: `> **${newLevel} rolls per week**`, inline: true },
        { name: "🔄 Rolls Reset", value: `> Every Sunday at 8:00 AM`, inline: true }
      ],
      footer: `Updated by ${moderatorTag}`
    },
    rollReset: {
      title: "🔄 Pet Rolls Reset Successfully!",
      description: "A moderator has reset your pet's rolls for this week.",
      fields: [
        { name: "🐾 Pet Name", value: `> ${petName}`, inline: true },
        { name: "🦊 Species", value: `> ${pet.species}`, inline: true },
        { name: "🎯 Pet Type", value: `> ${pet.petType}`, inline: true },
        { name: "📊 Level", value: `> Level ${pet.level}`, inline: true },
        { name: "🔄 Rolls Reset", value: `> ${result.oldRolls} → **${result.newRolls}** rolls`, inline: true },
        { name: "📅 Reset Schedule", value: `> Every Sunday at midnight`, inline: true }
      ],
      footer: `Reset by ${moderatorTag}`
    }
  };

  const config = embedConfigs[type];
  if (!config) {
    throw new Error(`Invalid pet embed type: ${type}`);
  }

  const embed = new EmbedBuilder()
    .setTitle(config.title)
    .setDescription(config.description)
    .addFields(config.fields)
    .setColor("#00FF00")
    .setFooter({ text: config.footer })
    .setTimestamp();

  // Set character as author with icon if available
  embed.setAuthor({ name: character.name, iconURL: character.icon });

  // Set pet image as thumbnail if available
  if (pet.imageUrl) {
    const encodedPetImageUrl = encodePetImageUrl(pet.imageUrl);
    const sanitizedPetImageUrl = validateAndSanitizeUrl(encodedPetImageUrl || pet.imageUrl);
    embed.setThumbnail(sanitizedPetImageUrl);
    console.log(`[mod.js]: Using pet image as thumbnail: "${sanitizedPetImageUrl}"`);
  } else {
    embed.setThumbnail("https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png");
    console.log(`[mod.js]: Using default thumbnail for pet`);
  }

  // Set banner image
  embed.setImage("https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png");
  console.log(`[mod.js]: Using banner image for pet ${type}`);

  return embed;
}

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

const villageEmojis = {
  rudania: '<:rudania:899492917452890142>',
  inariko: '<:inariko:899493009073274920>',
  vhintl: '<:vhintl:899492879205007450>',
};

const allVillageMounts = ['Horse', 'Donkey'];
const EDIT_NOTIFICATION_CHANNEL_ID = '1381479893090566144';

// ============================================================================
// ------------------- Command Definition -------------------
// Defines the /mod command and all subcommands
// ============================================================================

const modCommand = new SlashCommandBuilder()
  .setName('mod')
  .setDescription('🛠️ Moderator utilities: manage items, pets, encounters, status, tables, and submissions')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)

// ------------------- Subcommand: give -------------------
.addSubcommand(sub =>
  sub
    .setName('give')
    .setDescription('🎁 Give an item to a character')
    .addStringOption(opt =>
      opt
        .setName('character')
        .setDescription('Name of the target character')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt
        .setName('item')
        .setDescription('Name of the item to give')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(opt =>
      opt
        .setName('quantity')
        .setDescription('Amount of the item to give')
        .setRequired(true)
    )
)

// ------------------- Subcommand: petlevel -------------------
.addSubcommand(sub =>
  sub
    .setName('petlevel')
    .setDescription("🐾 Override a pet's level for a character")
    .addStringOption(opt =>
      opt
        .setName('character')
        .setDescription('Name of the character owner')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt
        .setName('petname')
        .setDescription("Name of the pet to override")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(opt =>
      opt
        .setName('level')
        .setDescription('New level value for the pet')
        .setRequired(true)
    )
)

// ------------------- Subcommand: mount -------------------
.addSubcommand(sub =>
  sub
    .setName('mount')
    .setDescription("🐴 Create a mount encounter")
    .addStringOption(option =>
      option
        .setName('village')
        .setDescription('Enter the village where the encounter happens')
        .setRequired(false)
        .addChoices(
          { name: 'Rudania', value: 'rudania' },
          { name: 'Inariko', value: 'inariko' },
          { name: 'Vhintl', value: 'vhintl' }
        )
    )
    .addStringOption(option =>
      option
        .setName('level')
        .setDescription('Choose the mount level (Basic, Mid, High)')
        .setRequired(false)
        .addChoices(
          { name: 'Basic', value: 'Basic' },
          { name: 'Mid', value: 'Mid' },
          { name: 'High', value: 'High' }
        )
    )
    .addStringOption(option =>
      option
        .setName('species')
        .setDescription('Choose the mount species')
        .setRequired(false)
        .addChoices(
          { name: 'Horse 🐴', value: 'Horse' },
          { name: 'Donkey 🍑', value: 'Donkey' },
          { name: 'Ostrich 🦃', value: 'Ostrich' },
          { name: 'Mountain Goat 🐐', value: 'Mountain Goat' },
          { name: 'Deer 🦌', value: 'Deer' },
          { name: 'Bullbo 🐗', value: 'Bullbo' },
          { name: 'Water Buffalo 🐃', value: 'Water Buffalo' },
          { name: 'Wolfos 🐺', value: 'Wolfos' },
          { name: 'Dodongo 🐉', value: 'Dodongo' },
          { name: 'Moose 🍁', value: 'Moose' },
          { name: 'Bear 🐻', value: 'Bear' }
        )
    )
)

// ------------------- Subcommand: approve -------------------
.addSubcommand(sub =>
  sub
    .setName('approve')
    .setDescription('✅ Approve or deny a submission')
    .addStringOption(opt =>
      opt
        .setName('submission_id')
        .setDescription('The ID of the submission to approve/deny.')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('action')
        .setDescription('Approve or deny the submission.')
        .setRequired(true)
        .addChoices(
          { name: 'Approve', value: 'approve' },
          { name: 'Deny', value: 'deny' }
        )
    )
    .addStringOption(opt =>
      opt
        .setName('reason')
        .setDescription('Provide a reason for denying the submission (optional).')
        .setRequired(false)
    )
)

// ------------------- Subcommand: approveedit -------------------
.addSubcommand(subcommand =>
  subcommand
    .setName('approveedit')
    .setDescription('Approve or reject a pending character edit')
    .addStringOption(option =>
      option
        .setName('requestid')
        .setDescription('The ID of the pending edit request')
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option
        .setName('approve')
        .setDescription('Whether to approve (true) or reject (false) the edit')
        .setRequired(true)
    )
)

// ------------------- Subcommand: inactivityreport -------------------
.addSubcommand(sub =>
  sub
    .setName('inactivityreport')
    .setDescription("📋 View members inactive for 3+ months")
)



// ------------------- Subcommand: blightpause -------------------
.addSubcommand(sub =>
  sub
    .setName('blightpause')
    .setDescription('⏸️ Pause or unpause blight progression for a character')
    .addStringOption(opt =>
      opt
        .setName('character')
        .setDescription('Name of the character to pause/unpause')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addBooleanOption(opt =>
      opt
        .setName('paused')
        .setDescription('True to pause, false to unpause')
        .setRequired(true)
    )
)

// ------------------- Subcommand: tokens -------------------
.addSubcommand(sub =>
  sub
    .setName('tokens')
    .setDescription('💠 Give tokens to a user')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('The user to give tokens to')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt
        .setName('amount')
        .setDescription('Number of tokens to give')
        .setRequired(true)
    )
)

// ------------------- Subcommand: kick -------------------
.addSubcommand(sub =>
  sub
    .setName('kick_travelers')
    .setDescription('👢 Kick users who have been Travelers for 14+ days without a character')
)

// ------------------- Subcommand: slots -------------------
.addSubcommand(sub =>
  sub
    .setName('slots')
    .setDescription('🎯 Update a user\'s character slots')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('The user to update slots for')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt
        .setName('slots')
        .setDescription('Number of character slots to set')
        .setRequired(true)
        .setMinValue(0)
    )
)

// ------------------- Subcommand: weather -------------------
.addSubcommand(sub =>
  sub
    .setName('weather')
    .setDescription('🌤️ Test the weather system')
    .addStringOption(opt =>
      opt
        .setName('village')
        .setDescription('The village to test weather for')
        .setRequired(true)
        .addChoices(
          { name: 'Rudania', value: 'Rudania' },
          { name: 'Inariko', value: 'Inariko' },
          { name: 'Vhintl', value: 'Vhintl' }
        )
    )
)

// ------------------- Subcommand: vendingreset -------------------
.addSubcommand(sub =>
  sub
    .setName('vendingreset')
    .setDescription('🧹 Reset all vending-related fields for a character (mod only)')
    .addStringOption(opt =>
      opt
        .setName('character')
        .setDescription('Name of the character to reset vending fields for')
        .setRequired(true)
        .setAutocomplete(true)
    )
)

// ------------------- Subcommand: resetpetrolls -------------------
.addSubcommand(subcommand =>
  subcommand
    .setName('resetpetrolls')
    .setDescription('Reset all pet rolls for all characters')
)

.addSubcommand(subcommand =>
  subcommand
    .setName('forceresetpetrolls')
    .setDescription('Force reset rolls for a specific pet')
    .addStringOption(option =>
      option
        .setName('character')
        .setDescription('The character name')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('petname')
        .setDescription('The pet name')
        .setRequired(true)
        .setAutocomplete(true)
    )
)



// ------------------- Subcommand: shopadd -------------------
.addSubcommand(sub =>
  sub
    .setName('shopadd')
    .setDescription('🛒 Add an item to the village shop')
    .addStringOption(option =>
      option
        .setName('itemname')
        .setDescription('Name of the item to add to the shop')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option
        .setName('stock')
        .setDescription('Quantity of the item to add to shop stock')
        .setRequired(true)
        .setMinValue(1)
    )
)

// ------------------- Subcommand: trigger-raid -------------------
.addSubcommand(sub =>
  sub
    .setName('trigger-raid')
    .setDescription('🐉 Manually trigger a raid for testing or RP purposes')
    .addStringOption(option =>
      option
        .setName('village')
        .setDescription('The village where the raid will take place')
        .setRequired(true)
        .addChoices(
          { name: 'Rudania', value: 'rudania' },
          { name: 'Inariko', value: 'inariko' },
          { name: 'Vhintl', value: 'vhintl' }
        )
    )
    .addStringOption(option =>
      option
        .setName('monster')
        .setDescription('The monster to raid (optional - random if not specified)')
        .setRequired(false)
        .setAutocomplete(true)
    )
)

// ============================================================================
// ------------------- Execute Command Handler -------------------
// Delegates logic to subcommand-specific handlers
// ============================================================================

async function execute(interaction) {
  try {
    const subcommand = interaction.options.getSubcommand();

    // Only defer with ephemeral for non-mount commands
    if (subcommand !== 'mount') {
      await interaction.deferReply({ flags: [4096] }); // 4096 is the flag for ephemeral messages
    } else {
      await interaction.deferReply();
    }

    if (subcommand === 'give') {
        return await handleGive(interaction);      
    } else if (subcommand === 'petlevel') {
        return await handlePetLevel(interaction);
    } else if (subcommand === 'mount') {
        return await handleMount(interaction);      
    } else if (subcommand === 'approve') {
        return await handleApprove(interaction);      
    } else if (subcommand === 'approveedit') {
        return await handleApproveEdit(interaction);
    } else if (subcommand === 'inactivityreport') {
        return await handleInactivityReport(interaction);      
      
    } else if (subcommand === 'blightpause') {
        return await handleBlightPause(interaction);
    } else if (subcommand === 'kick_travelers') {
        return await handleKickTravelers(interaction);      
    } else if (subcommand === 'tokens') {
        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
      
        try {
          let target = await User.findOne({ discordId: user.id });

          if (!target) {
            target = new User({
              discordId: user.id,
              tokens: 0,
              joinedAt: new Date(),
              status: 'active'
            });
          }
          
          target.tokens = (target.tokens || 0) + amount;
          await target.save();

          // Log to token tracker if user has one
          if (target.tokenTracker && isValidGoogleSheetsUrl(target.tokenTracker)) {
            try {
              const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
              const tokenRow = [
                `Mod Token Grant by ${interaction.user.username}`,
                interactionUrl,
                'Mod Grant',
                'earned',
                `+${amount}`
              ];
              await safeAppendDataToSheet(target.tokenTracker, target, 'loggedTracker!B7:F', [tokenRow], undefined, { skipValidation: true });
              console.log(`[mod.js]: ✅ Logged token grant to tracker for user ${user.id}`);
            } catch (sheetError) {
              console.error(`[mod.js]: ❌ Error logging to token tracker:`, sheetError);
              // Don't throw here, just log the error since the tokens were already given
            }
          }
          
          return interaction.editReply({
            content: `💠 <@${user.id}> has been given **${amount} tokens**. They now have **${target.tokens} total**.`,
            ephemeral: true
          });
        } catch (err) {
          console.error(`[mod.js] Error giving tokens:`, err);
          return interaction.editReply({
            content: `❌ Failed to give tokens to <@${user.id}>.`,
            ephemeral: true
          });
        }      
    } else if (subcommand === 'slots') {
        return await handleSlots(interaction);
    } else if (subcommand === 'weather') {
        return await handleWeather(interaction);
    } else if (subcommand === 'vendingreset') {
        return await handleVendingReset(interaction);
    } else if (subcommand === 'resetpetrolls') {
        return await handlePetRollsReset(interaction);
    } else if (subcommand === 'forceresetpetrolls') {
        return await handleForceResetPetRolls(interaction);
    } else if (subcommand === 'shopadd') {
        return await handleShopAdd(interaction);
    } else if (subcommand === 'trigger-raid') {
        return await handleTriggerRaid(interaction);
    } else {
        return interaction.editReply('❌ Unknown subcommand.');
    }

  } catch (error) {
    handleError(error, 'modCombined.js');
    console.error('[modCombined.js]: Command execution error', error);
    return interaction.editReply('⚠️ Something went wrong while processing the command.');
  }
}


// ============================================================================
// ------------------- Handlers -------------------.
// ============================================================================

// ------------------- Function: handleGive -------------------
// Gives an item to a character by name, validating quantity and existence.
async function handleGive(interaction) {
    const userId = interaction.user.id;
    const charName = interaction.options.getString('character');
    const itemName = interaction.options.getString('item');
    const quantity = interaction.options.getInteger('quantity');
  
    if (quantity < 1) {
      return interaction.editReply('❌ You must specify a quantity of at least **1**.');
    }
  
    // ------------------- Fetch Character & Item -------------------
    const character = await fetchCharacterByName(charName);
    if (!character) {
      return interaction.editReply(`❌ Character **${charName}** not found.`);
    }
  
    const item = await fetchItemByName(itemName);
    if (!item) {
      return interaction.editReply(`❌ Item **${itemName}** does not exist.`);
    }
  
    // ------------------- Apply Inventory Update -------------------
    await addItemInventoryDatabase(
      character._id,
      itemName,
      quantity,
      interaction,
      'Admin Give'
    );

    // ------------------- Update Google Sheet -------------------
    if (character.inventory && isValidGoogleSheetsUrl(character.inventory)) {
      try {
        const spreadsheetId = extractSpreadsheetId(character.inventory);
        const auth = await authorizeSheets();
        const range = 'loggedInventory!A2:M';
        const uniqueSyncId = uuidv4();
        const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
        
        const values = [[
          character.name,
          itemName,
          quantity.toString(),
          item.category.join(', '),
          item.type.join(', '),
          item.subtype.join(', '),
          'Admin Give',
          character.job,
          '',
          character.currentVillage,
          interactionUrl,
          formattedDateTime,
          uniqueSyncId
        ]];

        await safeAppendDataToSheet(
          character.inventory,
          character,
          range,
          values,
          undefined,
          { 
            skipValidation: true,
            context: {
              commandName: 'mod give',
              userTag: interaction.user.tag,
              userId: interaction.user.id,
              characterName: character.name,
              spreadsheetId: spreadsheetId,
              range: range,
              sheetType: 'inventory',
              options: {
                itemName: itemName,
                quantity: quantity
              }
            }
          }
        );
      } catch (sheetError) {
        console.error(`[mod.js]: ❌ Error updating Google Sheet:`, sheetError);
        // Don't throw here, just log the error since the item was already given
      }
    }
  
    // Send error messages as ephemeral but success message as public
    await interaction.editReply({ content: '✅ Processing...', ephemeral: true });
    return interaction.followUp(
      `✨ The Gods have blessed you! **${character.name}** now has **${itemName} × ${quantity}**!`
    );
  }

  // ------------------- Function: handlePetLevel -------------------
// Overrides a pet's level and syncs its rollsRemaining to match.
async function handlePetLevel(interaction) {
    const charName = interaction.options.getString('character');
    const petName = interaction.options.getString('petname');
    const newLevel = interaction.options.getInteger('level');
  
    const character = await fetchCharacterByName(charName);
    if (!character) {
      return interaction.editReply(
        `❌ Character **${charName}** not found in database.`
      );
    }
  
    const petDoc = await Pet.findOne({
      owner: character._id,
      name: petName,
    });
  
    if (!petDoc) {
      return interaction.editReply(
        `❌ Pet **${petName}** not found for **${character.name}**.`
      );
    }
  
    const oldLevel = petDoc.level;
    petDoc.level = newLevel;
    petDoc.rollsRemaining = newLevel;
    petDoc.lastRollDate = null; // Clear daily roll restriction so pet can roll immediately
    await petDoc.save();
  
    // Log character and pet data for debugging
    console.log(`[mod.js]: Character data:`, {
      name: character.name,
      icon: character.icon,
      userId: character.userId
    });
    console.log(`[mod.js]: Pet data:`, {
      name: petDoc.name,
      species: petDoc.species,
      petType: petDoc.petType,
      imageUrl: petDoc.imageUrl
    });
  
    // Create a beautiful embed for the pet level update
    const petLevelEmbed = createPetEmbed('levelUpdate', {
      character,
      pet: petDoc,
      petName,
      oldLevel,
      newLevel,
      moderatorTag: interaction.user.tag
    });

    // Log the embed data before sending
    console.log(`[mod.js]: Embed data:`, {
      author: petLevelEmbed.data.author,
      title: petLevelEmbed.data.title,
      fields: petLevelEmbed.data.fields,
      footer: petLevelEmbed.data.footer,
      color: petLevelEmbed.data.color
    });

    // Send the embed as a public message and mention the character owner
    try {
      await interaction.editReply({ content: '✅ Processing pet level update...', ephemeral: true });
      return await interaction.followUp({
        content: `🎉 <@${character.userId}> | ${character.name}'s pet ${petName} is now level ${newLevel}! It can roll ${newLevel} times per week! Rolls reset every Sunday at 8:00 AM.`,
        embeds: [petLevelEmbed]
      });
    } catch (error) {
      console.error(`[mod.js]: Error sending pet level embed:`, error);
      console.error(`[mod.js]: Embed data that caused error:`, JSON.stringify(petLevelEmbed.data, null, 2));
      throw error;
    }
  }
  
  // ------------------- Function: handleMount -------------------
// Generates a random mount encounter with optional village, level, and species.
async function handleMount(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.editReply('❌ You do not have permission to use this command.');
    }

    let village = interaction.options.getString('village');
  
    // ------------------- Determine Village from Channel -------------------
    if (!village) {
      const channelId = interaction.channelId;
      if (channelId === process.env.RUDANIA_TOWNHALL) {
        village = 'rudania';
      } else if (channelId === process.env.INARIKO_TOWNHALL) {
        village = 'inariko';
      } else if (channelId === process.env.VHINTL_TOWNHALL) {
        village = 'vhintl';
      } else {
        return interaction.editReply('❌ **You must use this command inside a Town Hall channel (Rudania, Inariko, or Vhintl).**');
      }
    }
  
    let species = interaction.options.getString('species');
    if (!species) {
      const mountData = getRandomMount(village);
      if (!mountData || mountData.village.toLowerCase() !== village.toLowerCase()) {
        return interaction.editReply(`❌ **Failed to find a valid mount species for ${village}.** Please try again.`);
      }
      species = mountData.mount;
    }
  
    let level = interaction.options.getString('level');
  
    if (!level) {
      const speciesToLevelMap = {
        Horse: ['Basic', 'Mid', 'High'],
        Donkey: ['Basic', 'Mid', 'High'],
        Ostrich: ['Basic'],
        'Mountain Goat': ['Basic'],
        Deer: ['Basic'],
        Bullbo: ['Mid'],
        'Water Buffalo': ['Mid'],
        Wolfos: ['Mid'],
        Dodongo: ['High'],
        Moose: ['High'],
        Bear: ['High'],
      };
  
      const validLevels = speciesToLevelMap[species] || [];
      if (validLevels.length === 0) {
        return interaction.editReply(`❌ Invalid species: ${species}. Please choose a valid species.`);
      }
  
      level = validLevels[Math.floor(Math.random() * validLevels.length)];
    }
  
    const encounterId = uuidv4().split('-')[0];
    const emoji = getMountEmoji(species);
    const villageWithEmoji = `${villageEmojis[village]} ${village}`;
  
    const encounterData = {
      users: [],
      mountType: species,
      rarity: 'To be determined',
      mountLevel: level,
      mountStamina: 'To be determined',
      environment: 'To be determined',
      village,
      actions: [],
      tameStatus: false,
      encounterId,
    };
  
    try {
      storeEncounter(encounterId, encounterData);
    } catch (error) {
      handleError(error, 'mod.js');
      console.error('[mod.js]: Error storing encounter:', error);
      return interaction.editReply('❌ Failed to store encounter. Please try again later.');
    }
  
    const embed = createMountEncounterEmbed(encounterData);
    await interaction.editReply({ embeds: [embed] });
  }
  
  // ------------------- Function: handleApprove -------------------
// Approves or denies a user submission and handles token updates, notifications, and reactions.
async function handleApprove(interaction) {
    const submissionId = interaction.options.getString('submission_id');
    const action = interaction.options.getString('action');
    const reason = interaction.options.getString('reason') || null;
  
    if (!submissionId || typeof submissionId !== 'string') {
      return interaction.editReply({ content: '❌ Invalid submission ID provided.', ephemeral: true });
    }
  
    try {
      const submission = await retrieveSubmissionFromStorage(submissionId);
      if (!submission) {
        return interaction.editReply({ content: `⚠️ Submission with ID \`${submissionId}\` not found.`, ephemeral: true });
      }
  
      const { userId, collab, category = 'art', finalTokenAmount: tokenAmount, title, messageUrl } = submission;
  
      if (!messageUrl) {
        throw new Error('Message URL is missing or invalid.');
      }
  
      const channelId = messageUrl.split('/')[5];
      const messageId = messageUrl.split('/')[6];
      const channel = await interaction.client.channels.fetch(channelId);
      const message = await channel.messages.fetch(messageId);
  
      if (action === 'approve') {
        const user = await getOrCreateToken(userId);
        if (!user) {
          return interaction.editReply({ content: `❌ User with ID \`${userId}\` not found.`, ephemeral: true });
        }
  
        await message.react('☑️');
  
        // Update the embed footer to show approval status
        await updateSubmissionEmbedFooter(message, 'approved', interaction.user.tag);
  
                if (collab) {
          const splitTokens = Math.floor(tokenAmount / 2);
          const collaboratorId = collab.replace(/[<@>]/g, '');

          await updateTokenBalance(userId, splitTokens);
          await appendEarnedTokens(userId, title, category, tokenAmount, messageUrl);

          await updateTokenBalance(collaboratorId, splitTokens);
          await appendEarnedTokens(collaboratorId, title, category, splitTokens, messageUrl);

          // Send embed DM to main user
          const mainUserEmbed = createApprovalDMEmbed(submissionId, title, splitTokens, true);
          await interaction.client.users.send(userId, { embeds: [mainUserEmbed] });

          // Send embed DM to collaborator
          const collabUserEmbed = createCollaborationApprovalDMEmbed(submissionId, title, splitTokens);
          await interaction.client.users.send(collaboratorId, { embeds: [collabUserEmbed] });
        } else {
          await updateTokenBalance(userId, tokenAmount);
          await appendEarnedTokens(userId, title, category, tokenAmount, messageUrl);

          // Send embed DM to user
          const userEmbed = createApprovalDMEmbed(submissionId, title, tokenAmount, false);
          await interaction.client.users.send(userId, { embeds: [userEmbed] });
        }

        await deleteSubmissionFromStorage(submissionId);
        
        // Create improved mod confirmation message
        const modConfirmationEmbed = createModApprovalConfirmationEmbed(submissionId, title, tokenAmount, userId, collab);
        return interaction.editReply({ embeds: [modConfirmationEmbed], ephemeral: true });
      }
  
      if (action === 'deny') {
        await message.react('❌');
  
        // Update the embed footer to show denial status
        await updateSubmissionEmbedFooter(message, 'denied', interaction.user.tag, reason);
  
                // Send embed DM to user for denial
        const denialEmbed = createDenialDMEmbed(submissionId, title, reason);
        await interaction.client.users.send(userId, { embeds: [denialEmbed] });

        await deleteSubmissionFromStorage(submissionId);
        
        // Create improved mod denial confirmation message
        const modDenialEmbed = createModDenialConfirmationEmbed(submissionId, title, userId, reason);
        return interaction.editReply({ embeds: [modDenialEmbed], ephemeral: true });
      }
  
      return interaction.editReply({ content: '❌ Invalid action specified. Use `approve` or `deny`.', ephemeral: true });
    } catch (error) {
      handleError(error, 'mod.js');
      console.error('[mod.js]: Error during approve/deny logic', error);
      return interaction.editReply({ content: '⚠️ An error occurred while processing the submission.', ephemeral: true });
    }
  }

  // ------------------- Function: handleApproveEdit -------------------
async function handleApproveEdit(interaction) {
  try {
    let requestId = sanitizeRequestId(interaction.options.getString('requestid'));
    const shouldApprove = interaction.options.getBoolean('approve');

    const pendingEdit = await retrievePendingEditFromStorage(requestId);
    if (!pendingEdit) return reply(interaction, '❌ No pending edit request found with that ID.');

    if (pendingEdit.status !== 'pending') {
      return reply(interaction, '❌ This edit request has already been processed.');
    }

    const character = await Character.findById(pendingEdit.characterId);
    if (!character) return reply(interaction, '❌ Character not found.');

    // ------------------- Database Update -------------------
    if (shouldApprove) {
      try {
        const updateValue = castValueByCategory(pendingEdit.category, pendingEdit.updatedValue);
        
        // Special handling for stamina and hearts updates
        if (pendingEdit.category === 'stamina') {
          await Character.findByIdAndUpdate(pendingEdit.characterId, {
            $set: {
              maxStamina: updateValue.maxStamina,
              currentStamina: updateValue.currentStamina
            }
          });
        } else if (pendingEdit.category === 'hearts') {
          await Character.findByIdAndUpdate(pendingEdit.characterId, {
            $set: {
              maxHearts: updateValue.maxHearts,
              currentHearts: updateValue.currentHearts
            }
          });
        } else {
          await Character.findByIdAndUpdate(pendingEdit.characterId, {
            $set: { [pendingEdit.category]: updateValue }
          });
        }
        
        console.log(`[mod.js]: ✅ Updated character ${character.name}'s ${pendingEdit.category} to`, updateValue);
      } catch (err) {
        handleError(err, 'mod.js');
        return reply(interaction, '❌ Failed to update the character. Please try again.');
      }
    }

    // ------------------- Notification Update -------------------
    const notificationChannel = interaction.guild.channels.cache.get(EDIT_NOTIFICATION_CHANNEL_ID);
    if (!notificationChannel?.isTextBased()) {
      return reply(interaction, '❌ Cannot update the mod notification — invalid or missing channel.');
    }

    try {
      const originalMsg = await notificationChannel.messages.fetch(pendingEdit.notificationMessageId);
      if (originalMsg) {
        const updatedContent = formatApprovalNotification({
          userTag: interaction.user.tag,
          userId: pendingEdit.userId,
          characterName: character.name,
          category: pendingEdit.category,
          previous: pendingEdit.previousValue,
          updated: pendingEdit.updatedValue,
          status: shouldApprove,
          requestId
        });
        await originalMsg.edit(updatedContent);
      }
    } catch (err) {
      handleError(err, 'mod.js');
      return reply(interaction, '❌ Could not update the original mod message. Edit request remains pending.');
    }

    await deletePendingEditFromStorage(requestId);

    // ------------------- User DM Notification -------------------
    try {
      const user = await interaction.client.users.fetch(pendingEdit.userId);
      const dmMessage = formatUserDM(character.name, pendingEdit.category, pendingEdit.previousValue, pendingEdit.updatedValue);
      await attemptDMWithRetry(user, dmMessage, 3);
    } catch (err) {
      handleError(err, 'mod.js');
      console.warn(`[mod.js]: Could not DM user ${pendingEdit.userId}`);
    }

    const replyEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✅ Character Edit Request Processed')
      .setDescription(`${character.name}'s ${pendingEdit.category} edit ${shouldApprove ? 'approved' : 'rejected'}!\nRequest ID: \`${requestId}\``)
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
      .setFooter({
        text: `Processed by ${interaction.user.tag}`
      })
      .setTimestamp();

    return reply(interaction, { embeds: [replyEmbed] });
  } catch (error) {
    handleError(error, 'mod.js');
    return reply(interaction, '❌ An error occurred while processing the edit request.');
  }
}


function sanitizeRequestId(rawId) {
  return rawId?.split(':').pop().replace(/[`'"]/g, '').trim();
}

function castValueByCategory(category, value) {
  if (category === 'age') return parseInt(value, 10);
  if (category === 'height') return parseFloat(value);
  if (category === 'stamina') {
    if (typeof value === 'object') {
      return {
        maxStamina: parseInt(value.maxStamina, 10),
        currentStamina: parseInt(value.currentStamina, 10)
      };
    }
    // If it's a single number, set both max and current to that value
    const staminaValue = parseInt(value, 10);
    return {
      maxStamina: staminaValue,
      currentStamina: staminaValue
    };
  }
  if (category === 'hearts') {
    if (typeof value === 'object') {
      return {
        maxHearts: parseInt(value.maxHearts, 10),
        currentHearts: parseInt(value.currentHearts, 10)
      };
    }
    // If it's a single number, set both max and current to that value
    const heartsValue = parseInt(value, 10);
    return {
      maxHearts: heartsValue,
      currentHearts: heartsValue
    };
  }
  return value;
}

function formatApprovalNotification({ userTag, userId, characterName, category, previous, updated, status, requestId }) {
  const isStamina = category === 'stamina';
  const prev = isStamina ? `Max: ${previous.maxStamina}, Current: ${previous.currentStamina}` : previous;
  const next = isStamina ? `Max: ${updated.maxStamina}, Current: ${updated.currentStamina}` : updated;

  const embed = new EmbedBuilder()
    .setColor(status ? '#00FF00' : '#FF0000')
    .setTitle(`📢 ${status ? 'APPROVED' : 'REJECTED'} CHARACTER EDIT REQUEST`)
    .addFields(
      { name: '🌱 User', value: `> \`${userId}\``, inline: false },
      { name: '👤 Character Name', value: `> \`${characterName}\``, inline: false },
      { name: '🛠️ Edited Category', value: `> \`${category}\``, inline: false },
      { name: '🔄 Previous Value', value: `> \`${prev}\``, inline: false },
      { name: '✅ Requested Value', value: `> \`${next}\``, inline: false },
      { name: '⏳ Status', value: `> ${status ? 'APPROVED' : 'REJECTED'} by ${userTag}`, inline: false },
      { name: '🔗 Request ID', value: `> \`${requestId}\``, inline: false }
    )
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .setFooter({
      text: 'Character Edit Request'
    })
    .setTimestamp();

  return { embeds: [embed] };
}

function formatUserDM(characterName, category, previous, updated) {
  const prev = typeof previous === 'object' ? JSON.stringify(previous) : previous;
  const next = typeof updated === 'object' ? JSON.stringify(updated) : updated;
  
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('🎉 Character Edit Approved!')
    .setDescription('Your character edit request has been approved and the changes have been applied.')
    .addFields(
      { name: '👤 Character', value: `> \`${characterName}\``, inline: false },
      { name: '🛠️ Category', value: `> \`${category}\``, inline: false },
      { name: '🔄 Previous Value', value: `> \`${prev}\``, inline: false },
      { name: '✅ New Value', value: `> \`${next}\``, inline: false }
    )
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .setFooter({
      text: 'Character Edit Request'
    })
    .setTimestamp();

  return { embeds: [embed] };
}

async function attemptDMWithRetry(user, message, retries = 3) {
  let attempts = 0;
  while (attempts < retries) {
    try {
      await user.send(message);
      return;
    } catch (err) {
      attempts++;
      console.warn(`[mod.js]: DM failed (attempt ${attempts}) to user ${user.id}: ${err.message}`);
      if (attempts >= retries) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function reply(interaction, content) {
  if (typeof content === 'string') {
    return interaction.editReply({ content, ephemeral: true });
  } else {
    return interaction.editReply({ ...content, ephemeral: true });
  }
}


// ------------------- Function: handleInactivityReport -------------------
// Generates a report of users inactive for 3+ months, including message counts and last activity.
async function handleInactivityReport(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.editReply("❌ You do not have permission to use this command.");
    }
  
    await interaction.editReply("📋 Generating inactivity report... this may take a minute.");
  
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  
    let inactiveUsers = await User.find({
      $or: [
        { lastMessageTimestamp: { $exists: false } },
        { lastMessageTimestamp: { $lte: threeMonthsAgo } },
      ],
    });
  
    inactiveUsers = (await Promise.all(
      inactiveUsers.map(async (user) => {
        try {
          await interaction.guild.members.fetch(user.discordId);
          return user;
        } catch {
          return null;
        }
      })
    )).filter(Boolean);
  
    const channelsToCheck = interaction.guild.channels.cache.filter(
      (channel) =>
        channel.isTextBased() &&
        channel.viewable &&
        channel.permissionsFor(interaction.client.user)?.has("ReadMessageHistory")
    );
  
    async function fetchLastMessage(user) {
      const results = await Promise.all(
        channelsToCheck.map(async (channel) => {
          try {
            const messages = await channel.messages.fetch({ limit: 100 });
            const userMessage = messages.find((msg) => msg.author.id === user.discordId);
            if (userMessage) {
              return { message: userMessage, channel };
            }
          } catch {}
          return null;
        })
      );
  
      const valid = results.filter(r => r !== null);
      if (valid.length > 0) {
        const best = valid.reduce((a, b) =>
          a.message.createdAt > b.message.createdAt ? a : b
        );
        user.lastMessageTimestamp = best.message.createdAt;
        user.lastMessageJump = `https://discord.com/channels/${interaction.guild.id}/${best.channel.id}/${best.message.id}`;
        await user.save();
      }
    }
  
    async function fetchMessageCount(user) {
      let total = 0;
      const threeMonthTimestamp = threeMonthsAgo.getTime();
  
      for (const channel of channelsToCheck.values()) {
        try {
          const messages = await channel.messages.fetch({ limit: 100 });
          messages.forEach((msg) => {
            if (
              msg.author.id === user.discordId &&
              msg.createdTimestamp > threeMonthTimestamp
            ) {
              total++;
            }
          });
        } catch {}
      }
  
      user.messageCount = total;
    }
  
    for (const user of inactiveUsers) {
      if (!user.lastMessageTimestamp || !user.lastMessageJump) {
        await fetchLastMessage(user);
      }
      await fetchMessageCount(user);
    }
  
    function formatDate(date) {
      const d = new Date(date);
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear().toString().slice(-2)}`;
    }
  
    const reportLines = inactiveUsers.map((user) => {
      const last = user.lastMessageTimestamp
        ? `[Jump to Message](${user.lastMessageJump}) on ${formatDate(user.lastMessageTimestamp)}`
        : "*Never Messaged*";
  
      const emoji =
        !user.lastMessageTimestamp ? "❌"
          : new Date(user.lastMessageTimestamp) > threeMonthsAgo ? "✅"
          : "⚠️";
  
      return `**Member:** <@${user.discordId}>\n**Status:** ${user.status || 'unknown'} ${emoji}\n**Last Message:** ${last}\n**Messages (3mo):** ${user.messageCount}`;
    });
  
    const chunks = splitMessage(reportLines.join('\n\n'), 2000);
    await interaction.editReply({ content: `📋 **Users inactive for 3+ months:**\n\n${chunks[0]}` });
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({ content: chunks[i], ephemeral: true });
    }
  
    function splitMessage(text, maxLength = 2000) {
      const lines = text.split("\n");
      const chunks = [];
      let chunk = "";
  
      for (const line of lines) {
        if (chunk.length + line.length + 1 > maxLength) {
          chunks.push(chunk);
          chunk = line;
        } else {
          chunk += "\n" + line;
        }
      }
      if (chunk.length) chunks.push(chunk);
      return chunks;
    }
  }
  

  
  // ------------------- Function: handleBlightPause -------------------
// Pauses or unpauses blight progression for a given character.
async function handleBlightPause(interaction) {
  const charName = interaction.options.getString('character');
  const pauseState = interaction.options.getBoolean('paused');

  try {
    const character = await fetchCharacterByName(charName);
    if (!character) {
      return interaction.editReply(`❌ Character **${charName}** not found.`);
    }

    character.blightPaused = pauseState;
    await character.save();

    const emoji = pauseState ? '⏸️' : '▶️';
    const verb = pauseState ? 'paused' : 'unpaused';

    return interaction.editReply(`${emoji} Blight progression for **${character.name}** has been **${verb}**.`);
  } catch (error) {
    handleError(error, 'mod.js');
    console.error('[mod.js]: Error in handleBlightPause', error);
    return interaction.editReply('❌ An error occurred while processing your request.');
  }
}

// ------------------- Function: handleKickTravelers -------------------
// Kicks members who joined 14+ days ago and only have Traveler role
async function handleKickTravelers(interaction) {
  const guild = interaction.guild;
  const travelerRoleId = process.env.TRAVELER_ROLE_ID;

  if (!travelerRoleId) {
    return interaction.editReply('❌ Environment variable `TRAVELER_ROLE_ID` not set.');
  }

  await interaction.editReply('🔍 Checking members...');

  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const kicked = [];

  const members = await guild.members.fetch();

  for (const [id, member] of members) {
    const hasTraveler = member.roles.cache.has(travelerRoleId);
    const joinedLongAgo = member.joinedAt && member.joinedAt.getTime() < fourteenDaysAgo;

    const userDoc = await User.findOne({ discordId: id });
    const hasCharacter = userDoc?.characters?.length > 0;

    if (hasTraveler && joinedLongAgo && !hasCharacter) {
      try {
        await member.kick("No character submitted within 2 weeks of joining.");
        kicked.push(`<@${id}>`);
      } catch (err) {
        console.warn(`❌ Could not kick ${id}: ${err.message}`);
      }
    }
  }

  return interaction.followUp({
    content: `✅ Kicked ${kicked.length} members:\n${kicked.join('\n') || 'None'}`,
    ephemeral: true
  });
}

// ------------------- Function: handleSlots -------------------
// Updates a user's character slots by adding to their current amount
async function handleSlots(interaction) {
  const targetUser = interaction.options.getUser('user');
  const slotsToAdd = interaction.options.getInteger('slots');

  try {
    let user = await User.findOne({ discordId: targetUser.id });
    
    if (!user) {
      user = new User({
        discordId: targetUser.id,
        characterSlot: slotsToAdd,
        status: 'active'
      });
    } else {
      user.characterSlot = (user.characterSlot || 0) + slotsToAdd;
    }
    
    await user.save();
    
    await interaction.editReply({
      content: `✅ Added **${slotsToAdd}** character slots to <@${targetUser.id}>. They now have **${user.characterSlot}** total slots.`,
      ephemeral: true
    });
  } catch (err) {
    console.error(`[mod.js] Error updating slots:`, err);
    return interaction.editReply({
      content: `❌ Failed to update slots for <@${targetUser.id}>.`,
      ephemeral: true
    });
  }
}

// ============================================================================
// ------------------- Weather Handler -------------------
// ============================================================================

async function handleWeather(interaction) {
  try {
    const village = interaction.options.getString('village');
    const currentSeason = getCurrentSeason();
    
    const weather = simulateWeightedWeather(village, currentSeason);
    weather.season = currentSeason; // Add season to weather object for embed
    
    const { embed, files } = await generateWeatherEmbed(village, weather);
    await interaction.editReply({ embeds: [embed], files });
  } catch (error) {
    console.error('[mod.js]: Error handling weather command:', error);
    await interaction.editReply({ content: '❌ An error occurred while generating the weather report.' });
  }
}

// Helper function to get current season
function getCurrentSeason() {
  const month = new Date().getMonth() + 1; // 1-12
  
  if (month >= 3 && month <= 5) return 'Spring';
  if (month >= 6 && month <= 8) return 'Summer';
  if (month >= 9 && month <= 11) return 'Autumn';
  return 'Winter';
}

// ------------------- Function: handleVendingReset -------------------
// Resets all vending-related fields for a character
async function handleVendingReset(interaction) {
  const charName = interaction.options.getString('character');
  try {
    const character = await fetchCharacterByName(charName);
    if (!character) {
      return interaction.editReply(`❌ Character **${charName}** not found.`);
    }
    // Reset vending-related fields to defaults
    character.vendingPoints = 0;
    character.vendorType = '';
    character.shopPouch = '';
    character.pouchSize = 0;
    character.shopLink = '';
    character.lastCollectedMonth = 0;
    character.vendingSetup = {
      shopLink: '',
      pouchType: '',
      shopImage: '',
      setupDate: null
    };
    character.vendingSync = false;
    character.shopImage = '';
    await character.save();
    return interaction.editReply(`✅ All vending fields for **${charName}** have been reset.`);
  } catch (error) {
    handleError(error, 'mod.js');
    console.error('[mod.js]: Error resetting vending fields:', error);
    return interaction.editReply('❌ Failed to reset vending fields.');
  }
}

// ------------------- Function: handlePetRollsReset -------------------
// Manually resets all pet rolls for all characters
async function handlePetRollsReset(interaction) {
  try {
    // Call the reset function
    await resetPetRollsForAllCharacters();
    
    return interaction.editReply({
      content: "✅ Pet rolls have been manually reset for all active pets.",
      ephemeral: true
    });
  } catch (error) {
    handleError(error, "mod.js", {
      commandName: '/mod resetpetrolls',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      options: {
        subcommand: 'resetpetrolls'
      }
    });
    
    console.error(`[mod.js]: Error in /mod resetpetrolls:`, error);
    
    return interaction.editReply({
      content: `❌ Failed to reset pet rolls: ${error.message || 'Unknown error'}`,
      ephemeral: true
    });
  }
}

// ------------------- Function: handleForceResetPetRolls -------------------
async function handleForceResetPetRolls(interaction) {
  try {
    const charName = interaction.options.getString('character');
    const petName = interaction.options.getString('petname');
    
    const character = await fetchCharacterByName(charName);
    if (!character) {
      return interaction.editReply(
        `❌ Character **${charName}** not found in database.`
      );
    }
    
    // Get the pet details for the embed
    const pet = await Pet.findOne({
      owner: character._id,
      name: petName,
    });
    
    if (!pet) {
      return interaction.editReply(
        `❌ Pet **${petName}** not found for **${character.name}**.`
      );
    }
    
    const result = await forceResetPetRolls(character._id, petName);
    
    // Log character and pet data for debugging
    console.log(`[mod.js]: Character data (force reset):`, {
      name: character.name,
      icon: character.icon,
      userId: character.userId
    });
    console.log(`[mod.js]: Pet data (force reset):`, {
      name: pet.name,
      species: pet.species,
      petType: pet.petType,
      imageUrl: pet.imageUrl
    });

    // Create a beautiful embed for the pet roll reset
    const resetEmbed = createPetEmbed('rollReset', {
      character,
      pet,
      petName,
      result,
      moderatorTag: interaction.user.tag
    });

    // Log the embed data before sending
    console.log(`[mod.js]: Reset embed data:`, {
      author: resetEmbed.data.author,
      title: resetEmbed.data.title,
      thumbnail: resetEmbed.data.thumbnail,
      image: resetEmbed.data.image,
      fields: resetEmbed.data.fields,
      footer: resetEmbed.data.footer,
      color: resetEmbed.data.color
    });

    // Send the embed as a public message and mention the character owner
    try {
      await interaction.editReply({ content: '✅ Processing pet roll reset...', ephemeral: true });
      return await interaction.followUp({
        content: `🔄 <@${character.userId}> | ${character.name}'s pet ${petName} rolls have been reset from ${result.oldRolls} to ${result.newRolls} rolls! Daily reset at 8:00 AM.`,
        embeds: [resetEmbed]
      });
    } catch (error) {
      console.error(`[mod.js]: Error sending pet reset embed:`, error);
      console.error(`[mod.js]: Reset embed data that caused error:`, JSON.stringify(resetEmbed.data, null, 2));
      throw error;
    }
  } catch (error) {
    handleError(error, "mod.js", {
      commandName: '/mod forceresetpetrolls',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      options: {
        subcommand: 'forceresetpetrolls',
        character: interaction.options.getString('character'),
        petname: interaction.options.getString('petname')
      }
    });
    
    console.error(`[mod.js]: Error in /mod forceresetpetrolls:`, error);
    
    return interaction.editReply({
      content: `❌ Failed to reset pet rolls: ${error.message || 'Unknown error'}`,
      ephemeral: true
    });
  }
}



// ------------------- Function: handleShopAdd -------------------
// Adds an item to the village shop
async function handleShopAdd(interaction) {
  const itemName = interaction.options.getString('itemname');
  const stock = interaction.options.getInteger('stock');

  if (stock < 1) {
    return interaction.editReply('❌ You must specify a quantity of at least **1** for the shop stock.');
  }

  try {
    // Fetch the item from the database to get all its properties
    const item = await ItemModel.findOne({ 
      itemName: { $regex: new RegExp(`^${itemName}$`, 'i') }
    });
    
    if (!item) {
      return interaction.editReply(`❌ Item **${itemName}** does not exist in the database.`);
    }

    // Always use database prices
    const finalBuyPrice = item.buyPrice || 0;
    const finalSellPrice = item.sellPrice || 0;

    // Check if item already exists in shop
    const existingShopItem = await VillageShopsModel.findOne({ 
      itemName: { $regex: new RegExp(`^${itemName}$`, 'i') }
    });

    if (existingShopItem) {
      // Update existing shop item
      existingShopItem.stock += stock;
      existingShopItem.buyPrice = finalBuyPrice;
      existingShopItem.sellPrice = finalSellPrice;
      await existingShopItem.save();
      
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Shop Item Updated')
          .setDescription(`Updated **${itemName}** in the village shop.`)
          .addFields(
            { name: '📦 New Stock', value: `${existingShopItem.stock}`, inline: true },
            { name: '💰 Buy Price', value: `${finalBuyPrice} tokens`, inline: true },
            { name: '💸 Sell Price', value: `${finalSellPrice} tokens`, inline: true },
            { name: '📝 Item ID', value: `\`${item._id}\``, inline: false },
            { name: '🏷️ Category', value: item.category?.join(', ') || 'Misc', inline: true },
            { name: '🎯 Type', value: item.type?.join(', ') || 'Unknown', inline: true }
          )
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
          .setFooter({ text: `Updated by ${interaction.user.tag}` })
          .setTimestamp()],
        ephemeral: true
      });
    } else {
      // Create new shop item with all the item's properties
      const newShopItem = new VillageShopsModel({
        itemId: item._id,
        itemName: item.itemName,
        image: item.image || 'No Image',
        imageType: item.imageType || 'No Image Type',
        itemRarity: item.itemRarity || 1,
        category: item.category || ['Misc'],
        categoryGear: item.categoryGear || 'None',
        type: item.type || ['Unknown'],
        subtype: item.subtype || ['None'],
        recipeTag: item.recipeTag || ['#Not Craftable'],
        craftingMaterial: item.craftingMaterial || [],
        buyPrice: finalBuyPrice,
        sellPrice: finalSellPrice,
        staminaToCraft: item.staminaToCraft || null,
        modifierHearts: item.modifierHearts || 0,
        staminaRecovered: item.staminaRecovered || 0,
        obtain: item.obtain || [],
        obtainTags: item.obtainTags || [],
        crafting: item.crafting || false,
        gathering: item.gathering || false,
        looting: item.looting || false,
        vending: item.vending || false,
        traveling: item.traveling || false,
        specialWeather: typeof item.specialWeather === 'object' ? false : (item.specialWeather || false),
        petPerk: item.petPerk || false,
        exploring: item.exploring || false,
        craftingJobs: item.craftingJobs || [],
        craftingTags: item.craftingTags || [],
        artist: item.artist || false,
        blacksmith: item.blacksmith || false,
        cook: item.cook || false,
        craftsman: item.craftsman || false,
        maskMaker: item.maskMaker || false,
        researcher: item.researcher || false,
        weaver: item.weaver || false,
        witch: item.witch || false,
        locations: item.locations || [],
        locationsTags: item.locationsTags || [],
        emoji: item.emoji || '',
        allJobs: item.allJobs || ['None'],
        allJobsTags: item.allJobsTags || ['None'],
        stock: stock
      });

      await newShopItem.save();
      
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Shop Item Added')
          .setDescription(`Successfully added **${itemName}** to the village shop.`)
          .addFields(
            { name: '📦 Stock', value: `${stock}`, inline: true },
            { name: '💰 Buy Price', value: `${finalBuyPrice} tokens`, inline: true },
            { name: '💸 Sell Price', value: `${finalSellPrice} tokens`, inline: true },
            { name: '📝 Item ID', value: `\`${item._id}\``, inline: false },
            { name: '🏷️ Category', value: item.category?.join(', ') || 'Misc', inline: true },
            { name: '🎯 Type', value: item.type?.join(', ') || 'Unknown', inline: true }
          )
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
          .setFooter({ text: `Added by ${interaction.user.tag}` })
          .setTimestamp()],
        ephemeral: true
      });
    }
  } catch (error) {
    handleError(error, 'mod.js', {
      commandName: '/mod shopadd',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      options: {
        itemName: itemName,
        stock: stock
      }
    });
    console.error('[mod.js]: Error adding shop item:', error);
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Shop Add Error')
        .setDescription('An error occurred while adding the item to the shop.')
        .addFields(
          { name: '🔍 Item Name', value: itemName, inline: true },
          { name: '📦 Stock', value: stock.toString(), inline: true }
        )
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
        .setFooter({ text: 'Error Handling' })
        .setTimestamp()],
      ephemeral: true
    });
  }
}

// ------------------- Function: handleTriggerRaid -------------------
// Manually triggers a raid for testing or RP purposes
async function handleTriggerRaid(interaction) {
  const village = interaction.options.getString('village');
  const monsterName = interaction.options.getString('monster');

  try {
    // Get a random monster if none specified
    let monster;
    if (monsterName) {
      monster = await fetchMonsterByName(monsterName);
      if (!monster) {
        return interaction.editReply({ content: '❌ **Specified monster not found.**' });
      }
      // Check if monster is tier 5 or above
      if (monster.tier < 5) {
        return interaction.editReply({ content: `❌ **${monster.name} is tier ${monster.tier}. Only tier 5+ monsters can be used for triggered raids.**` });
      }
    } else {
      // Get a random monster from the database (tier 5 and above only)
      const allMonsters = await fetchAllMonsters();
      const tier5PlusMonsters = allMonsters.filter(m => m.tier >= 5);
      if (tier5PlusMonsters.length === 0) {
        return interaction.editReply({ content: '❌ **No tier 5+ monsters found in database.**' });
      }
      monster = tier5PlusMonsters[Math.floor(Math.random() * tier5PlusMonsters.length)];
    }

    // Capitalize the village name to match the Raid model enum values
    const capitalizedVillage = village.charAt(0).toUpperCase() + village.slice(1);
    
    console.log(`[mod.js]: 🎯 Triggering raid for ${monster.name} in ${capitalizedVillage}`);
    console.log(`[mod.js]: 📍 Interaction type: ${interaction?.constructor?.name || 'unknown'}`);
    console.log(`[mod.js]: 📍 Channel ID: ${interaction?.channel?.id || 'unknown'}`);
    
    // Trigger the raid
    const result = await triggerRaid(monster, interaction, capitalizedVillage, false);

    if (!result || !result.success) {
      return interaction.editReply({ 
        content: `❌ **Failed to trigger the raid:** ${result?.error || 'Unknown error'}`,
        ephemeral: true
      });
    }

    console.log(`[mod.js]: ✅ Raid triggered successfully, sending confirmation message`);
    
    // Don't send a separate success message - the raid embed serves as the success message
    return interaction.editReply({ 
      content: `✅ **Raid triggered successfully!** The raid embed has been posted in the channel.`,
      ephemeral: true
    });

  } catch (error) {
    handleError(error, 'mod.js', {
      commandName: '/mod trigger-raid',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      options: {
        village: village,
        monster: monsterName
      }
    });
    
    console.error('[mod.js]: Error triggering raid:', error);
    return interaction.editReply({ 
      content: '⚠️ **An error occurred while triggering the raid.**',
      ephemeral: true
    });
  }
}

// ============================================================================
// ------------------- Export Command -------------------
// ============================================================================

module.exports = {
  data: modCommand,
  execute
};