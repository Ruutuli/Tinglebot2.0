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
  safeAppendDataToSheet,
  retryPendingSheetOperations,
  getPendingSheetOperationsCount
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

const { simulateWeightedWeather } = require('../../services/weatherService');

// ------------------- Database Models -------------------
const ApprovedSubmission = require('../../models/ApprovedSubmissionModel');
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
const { generateWeatherEmbed } = require('../../services/weatherService');
const WeatherService = require('../../services/weatherService');

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
// Encodes pet image URLs for safe embedding
function encodePetImageUrl(petImageUrl) {
  if (!petImageUrl) return null;
  try {
    const lastSlashIndex = petImageUrl.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
      const baseUrl = petImageUrl.substring(0, lastSlashIndex + 1);
      const filename = petImageUrl.substring(lastSlashIndex + 1);
      const encodedFilename = encodeURIComponent(filename);
      const encodedUrl = baseUrl + encodedFilename;
      return encodedUrl;
    }
  } catch (error) {
    console.error(`[mod.js]: ❌ Error encoding pet image URL: ${error.message}`);
  }
  return null;
}

// ------------------- Function: getMonsterRegion -------------------
// Determines the region of a monster based on its location flags
function getMonsterRegion(monster) {
  if (monster.eldin) return 'Eldin';
  if (monster.lanayru) return 'Lanayru';
  if (monster.faron) return 'Faron';
  if (monster.centralHyrule) return 'CentralHyrule';
  if (monster.gerudo) return 'Gerudo';
  if (monster.hebra) return 'Hebra';
  return 'Unknown';
}

// ------------------- Function: isMonsterInRegion -------------------
// Checks if a monster belongs to a specific region
function isMonsterInRegion(monster, region) {
  const regionLower = region.toLowerCase();
  return monster[regionLower] === true;
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

// ------------------- Approval Notification Message Update Helper -------------------
async function updateApprovalNotificationMessage(interaction, submissionId, status, reason = null) {
  try {
    // Find the approval notification message in the approval channel
    const approvalChannel = interaction.client.channels.cache.get('1381479893090566144');
    if (!approvalChannel?.isTextBased()) {
      console.warn('[mod.js]: Approval channel not found or not text-based');
      return;
    }

    // Search for the notification message that contains this submission ID
    const messages = await approvalChannel.messages.fetch({ limit: 50 });
    const notificationMessage = messages.find(msg => {
      const embed = msg.embeds[0];
      return embed && embed.fields && embed.fields.some(field => 
        field.name === '🆔 Submission ID' && field.value.includes(submissionId)
      );
    });

    if (!notificationMessage) {
      console.warn(`[mod.js]: No notification message found for submission ${submissionId}`);
      return;
    }

    // Update the notification message
    const embed = notificationMessage.embeds[0];
    const updatedEmbed = embed.toJSON();
    
    // Update the title and color based on status
    if (status === 'approved') {
      updatedEmbed.title = '✅ APPROVED ART SUBMISSION!';
      updatedEmbed.color = 0x00FF00; // Green
    } else if (status === 'denied') {
      updatedEmbed.title = '❌ DENIED ART SUBMISSION!';
      updatedEmbed.color = 0xFF0000; // Red
    }

    // Update the description
    updatedEmbed.description = status === 'approved' 
      ? '✅ **Approved and tokens awarded!**'
      : `❌ **Denied${reason ? ` - ${reason}` : ''}**`;

    // Update the footer
    updatedEmbed.footer = {
      text: status === 'approved' 
        ? `✅ Approved by ${interaction.user.tag}`
        : `❌ Denied by ${interaction.user.tag}${reason ? ` - ${reason}` : ''}`,
      iconURL: undefined
    };

    await notificationMessage.edit({ embeds: [updatedEmbed] });
    console.log(`[mod.js]: ✅ Updated approval notification message for submission ${submissionId}`);
  } catch (error) {
    console.error(`[mod.js]: ❌ Error updating approval notification message:`, error);
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
async function createModApprovalConfirmationEmbed(submissionId, title, tokenAmount, userId, collab) {
  const embed = createSubmissionEmbed('modApproval', { submissionId, title, tokenAmount, userId, collab });
  
  // Get user token tracker URLs
  const user = await User.findOne({ discordId: userId });
  const userTokenTracker = user?.tokenTracker || 'No token tracker set up';
  const userTrackerLink = userTokenTracker !== 'No token tracker set up' ? `[View Token Tracker](${userTokenTracker})` : 'No token tracker set up';
  
  // Add token tracker links for collaboration
  if (collab) {
    const collaboratorId = collab.replace(/[<@>]/g, '');
    const splitTokens = Math.floor(tokenAmount / 2);
    
    // Get collaborator token tracker URL
    const collaborator = await User.findOne({ discordId: collaboratorId });
    const collabTokenTracker = collaborator?.tokenTracker || 'No token tracker set up';
    const collabTrackerLink = collabTokenTracker !== 'No token tracker set up' ? `[View Token Tracker](${collabTokenTracker})` : 'No token tracker set up';
    
    embed.addFields(
      { 
        name: '💰 Main User Tokens', 
        value: `<@${userId}> received **${splitTokens} tokens**\n${userTrackerLink}`, 
        inline: true 
      },
      { 
        name: '💰 Collaborator Tokens', 
        value: `<@${collaboratorId}> received **${splitTokens} tokens**\n${collabTrackerLink}`, 
        inline: true 
      }
    );
  } else {
    embed.addFields(
      { 
        name: '💰 User Tokens', 
        value: `<@${userId}> received **${tokenAmount} tokens**\n${userTrackerLink}`, 
        inline: true 
      }
    );
  }
  
  return embed;
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

  // Validate required parameters based on type
  if (!character || !pet || !petName || !moderatorTag) {
    throw new Error('Missing required parameters for createPetEmbed');
  }

  if (type === 'levelUpdate' && (oldLevel === undefined || newLevel === undefined)) {
    throw new Error('Missing oldLevel or newLevel for levelUpdate type');
  }

  if (type === 'rollReset' && !result) {
    throw new Error('Missing result object for rollReset type');
  }

  // Ensure result object has required properties for rollReset type
  if (type === 'rollReset' && (!result.oldRolls || !result.newRolls)) {
    console.warn(`[mod.js]: Result object missing oldRolls or newRolls:`, result);
    // Provide fallback values
    result.oldRolls = result.oldRolls || 0;
    result.newRolls = result.newRolls || 0;
  }

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

// ------------------- Subcommand: debuff -------------------
.addSubcommand(sub =>
  sub
    .setName('debuff')
    .setDescription('⚠️ Apply or remove a debuff from a character')
    .addStringOption(opt =>
      opt
        .setName('character')
        .setDescription('Name of the target character')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt
        .setName('action')
        .setDescription('Apply or remove the debuff')
        .setRequired(true)
        .addChoices(
          { name: 'Apply Debuff', value: 'apply' },
          { name: 'Remove Debuff', value: 'remove' }
        )
    )
    .addIntegerOption(opt =>
      opt
        .setName('days')
        .setDescription('Number of days for the debuff (default: 7)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(30)
    )
    .addStringOption(opt =>
      opt
        .setName('reason')
        .setDescription('Reason for applying the debuff')
        .setRequired(false)
    )
)

// ------------------- Subcommand: sheets -------------------
.addSubcommand(sub =>
  sub
    .setName('sheets')
    .setDescription('📊 Manage Google Sheets operations and retry failed operations')
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('The action to perform')
        .setRequired(true)
        .addChoices(
          { name: 'Retry Pending Operations', value: 'retry' },
          { name: 'Check Status', value: 'status' },
          { name: 'Clear All Pending', value: 'clear' }
        )
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
    .setDescription('🌤️ Generate weather and post in channel (does not save to database)')
    .addStringOption(opt =>
      opt
        .setName('village')
        .setDescription('The village to generate weather for')
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

// ------------------- Subcommand: blightoverride -------------------
.addSubcommand(sub =>
  sub
    .setName('blightoverride')
    .setDescription('🚨 Admin override for blight healing in emergencies')
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('The emergency action to perform')
        .setRequired(true)
        .addChoices(
          { name: 'Wipe All Blight', value: 'wipe_all' },
          { name: 'Wipe Village Blight', value: 'wipe_village' },
          { name: 'Wipe Character Blight', value: 'wipe_character' },
          { name: 'Set All Blight Level', value: 'set_all_level' },
          { name: 'Set Village Blight Level', value: 'set_village_level' },
          { name: 'Set Character Blight Level', value: 'set_character_level' }
        )
    )
    .addStringOption(option =>
      option
        .setName('target')
        .setDescription('Target for the action (village name, character name, or "all")')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option
        .setName('level')
        .setDescription('Blight level to set (0-5, only for set actions)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(5)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the emergency override')
        .setRequired(false)
    )
)

// ============================================================================
// ------------------- Execute Command Handler -------------------
// Delegates logic to subcommand-specific handlers
// ============================================================================

async function execute(interaction) {
  try {
    const subcommand = interaction.options.getSubcommand();

    // Only defer with ephemeral for non-mount and non-weather commands
    if (subcommand !== 'mount' && subcommand !== 'weather') {
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
    } else if (subcommand === 'blightoverride') {
        return await handleBlightOverride(interaction);
    } else if (subcommand === 'debuff') {
        return await handleDebuff(interaction);
    } else if (subcommand === 'sheets') {
        return await handleSheets(interaction);
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
  
    // Send processing message as ephemeral
    await interaction.editReply({ content: '✅ Processing...', ephemeral: true });
    
    // Create a beautiful embed for the success message
    const successEmbed = new EmbedBuilder()
      .setColor('#59A914') // Green color for success
      .setTitle('✨ Divine Blessing Received!')
      .setDescription(`The Gods have blessed **${character.name}** with divine gifts!`)
      .setAuthor({
        name: `${character.name}`,
        iconURL: character.icon || 'https://via.placeholder.com/100',
        url: character.inventory || null
      })
      .addFields(
        { 
          name: '🎁 Item Received', 
          value: `**${itemName}** × **${quantity}**`, 
          inline: false 
        },
        { 
          name: '👤 Character', 
          value: `**${character.name}**`, 
          inline: false 
        }
      )
      .setThumbnail(validateAndSanitizeUrl(item.image, 'https://via.placeholder.com/100'))
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
      .setFooter({ text: 'Divine blessing bestowed by the Gods ✨' })
      .setTimestamp();
    
    // Send the embed as a public message and mention the character owner
    return interaction.followUp({
      content: `🎉 <@${character.userId}> | The Gods have blessed you!`,
      embeds: [successEmbed]
    });
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
    try {
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
      await interaction.editReply({ content: '✅ Processing pet level update...', ephemeral: true });
      return await interaction.followUp({
        content: `🎉 <@${character.userId}> | ${character.name}'s pet ${petName} is now level ${newLevel}! It can roll ${newLevel} times per week! Rolls reset every Sunday at 8:00 AM.`,
        embeds: [petLevelEmbed]
      });
    } catch (error) {
      console.error(`[mod.js]: Error creating or sending pet level embed:`, error);
      handleError(error, 'mod.js', {
        commandName: '/mod petlevel',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        characterName: character.name,
        petName: petName,
        oldLevel: oldLevel,
        newLevel: newLevel
      });
      
      return interaction.editReply({
        content: `❌ Failed to create pet level embed: ${error.message || 'Unknown error'}`,
        ephemeral: true
      });
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

        // Update the approval notification message in the approval channel
        await updateApprovalNotificationMessage(interaction, submissionId, 'approved', null);

        // Save approved submission to database
        const approvedSubmissionData = {
          submissionId: submission.submissionId,
          title: submission.title || submission.fileName,
          fileName: submission.fileName || null,
          category: submission.category || 'art',
          userId: submission.userId,
          username: submission.username,
          userAvatar: submission.userAvatar,
          fileUrl: submission.fileUrl || null,
          messageUrl: submission.messageUrl,
          finalTokenAmount: submission.finalTokenAmount,
          tokenCalculation: submission.tokenCalculation,
          baseSelections: submission.baseSelections || [],
          baseCounts: submission.baseCounts || new Map(),
          typeMultiplierSelections: submission.typeMultiplierSelections || [],
          typeMultiplierCounts: submission.typeMultiplierCounts || new Map(),
          productMultiplierValue: submission.productMultiplierValue,
          addOnsApplied: submission.addOnsApplied || [],
          specialWorksApplied: submission.specialWorksApplied || [],
          wordCount: submission.wordCount,
          link: submission.link,
          description: submission.description,
          collab: submission.collab,
          blightId: submission.blightId || null,
          questEvent: submission.questEvent || 'N/A',
          questBonus: submission.questBonus || 'N/A',
          approvedBy: interaction.user.tag,
          approvedAt: new Date(),
          approvalMessageId: interaction.id,
          pendingNotificationMessageId: submission.pendingNotificationMessageId || null,
          submittedAt: submission.submittedAt || new Date()
        };

        try {
          const approvedSubmission = new ApprovedSubmission(approvedSubmissionData);
          await approvedSubmission.save();
          console.log(`[mod.js]: ✅ Saved approved submission ${submissionId} to database`);
        } catch (dbError) {
          handleError(dbError, 'mod.js');
          console.error(`[mod.js]: ❌ Failed to save approved submission to database:`, dbError);
          // Continue with token updates even if database save fails
        }

        let tokenErrors = [];
        
        if (collab) {
          const splitTokens = Math.floor(tokenAmount / 2);
          const collaboratorId = collab.replace(/[<@>]/g, '');

          try {
            await updateTokenBalance(userId, splitTokens);
            await appendEarnedTokens(userId, title, category, splitTokens, messageUrl);
          } catch (tokenError) {
            console.error(`[mod.js]: ❌ Error updating tokens for main user ${userId}:`, tokenError);
            tokenErrors.push(`Main user (${userId})`);
          }

          try {
            await updateTokenBalance(collaboratorId, splitTokens);
            await appendEarnedTokens(collaboratorId, title, category, splitTokens, messageUrl);
          } catch (tokenError) {
            console.error(`[mod.js]: ❌ Error updating tokens for collaborator ${collaboratorId}:`, tokenError);
            tokenErrors.push(`Collaborator (${collaboratorId})`);
          }

          // Send embed DM to main user
          try {
            const mainUserEmbed = createApprovalDMEmbed(submissionId, title, splitTokens, true);
            await interaction.client.users.send(userId, { embeds: [mainUserEmbed] });
          } catch (dmError) {
            console.error(`[mod.js]: ❌ Error sending DM to main user ${userId}:`, dmError);
          }

          // Send embed DM to collaborator
          try {
            const collabUserEmbed = createCollaborationApprovalDMEmbed(submissionId, title, splitTokens);
            await interaction.client.users.send(collaboratorId, { embeds: [collabUserEmbed] });
          } catch (dmError) {
            console.error(`[mod.js]: ❌ Error sending DM to collaborator ${collaboratorId}:`, dmError);
          }
        } else {
          // No collaboration - assign all tokens to the main user
          try {
            await updateTokenBalance(userId, tokenAmount);
            await appendEarnedTokens(userId, title, category, tokenAmount, messageUrl);
          } catch (tokenError) {
            console.error(`[mod.js]: ❌ Error updating tokens for user ${userId}:`, tokenError);
            tokenErrors.push(`User (${userId})`);
          }

          // Send embed DM to user
          try {
            const userEmbed = createApprovalDMEmbed(submissionId, title, tokenAmount, false);
            await interaction.client.users.send(userId, { embeds: [userEmbed] });
          } catch (dmError) {
            console.error(`[mod.js]: ❌ Error sending DM to user ${userId}:`, dmError);
          }
        }

        await deleteSubmissionFromStorage(submissionId);
        
        // Create improved mod confirmation message
        const modConfirmationEmbed = await createModApprovalConfirmationEmbed(submissionId, title, tokenAmount, userId, collab);
        
        // Add warning if token updates failed
        let warningMessage = '';
        if (tokenErrors.length > 0) {
          warningMessage = `⚠️ **Note:** Submission approved, but there were issues updating token trackers for: ${tokenErrors.join(', ')}. Please check that users have valid token tracker URLs set up.`;
        }
        
        return interaction.editReply({ 
          content: warningMessage,
          embeds: [modConfirmationEmbed], 
          ephemeral: true 
        });
      }
  
      if (action === 'deny') {
        await message.react('❌');
  
        // Update the embed footer to show denial status
        await updateSubmissionEmbedFooter(message, 'denied', interaction.user.tag, reason);

        // Update the approval notification message in the approval channel
        await updateApprovalNotificationMessage(interaction, submissionId, 'denied', reason);
  
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
    const currentSeason = WeatherService.getCurrentSeason();
    
    // Use the unified weather service for moderation commands
    const weather = await WeatherService.simulateWeightedWeather(village, currentSeason, { 
      useDatabaseHistory: false, // Use memory-based for moderation
      validateResult: true 
    });
    
    if (!weather) {
      await interaction.editReply({ content: '❌ Failed to generate weather preview.' });
      return;
    }
    
    weather.season = currentSeason; // Add season to weather object for embed
    
    // Generate the weather embed
    const { embed, files } = await generateWeatherEmbed(village, weather);
    
    // Send processing message as ephemeral
    await interaction.editReply({ content: '✅ Generating weather...', ephemeral: true });
    
    // Post the weather embed in the channel (not ephemeral)
    await interaction.followUp({ 
      embeds: [embed], 
      files,
      content: `🌤️ **${village} Weather Generated** - Posted by ${interaction.user.tag}`
    });
    
    console.log(`[mod.js]: Generated weather for ${village} and posted in channel (not saved to database)`);
  } catch (error) {
    console.error('[mod.js]: Error handling weather command:', error);
    await interaction.editReply({ content: '❌ An error occurred while generating the weather report.' });
  }
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
    try {
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
      await interaction.editReply({ content: '✅ Processing pet roll reset...', ephemeral: true });
      return await interaction.followUp({
        content: `🔄 <@${character.userId}> | ${character.name}'s pet ${petName} rolls have been reset from ${result?.oldRolls || 0} to ${result?.newRolls || 0} rolls! Daily reset at 8:00 AM.`,
        embeds: [resetEmbed]
      });
    } catch (error) {
      console.error(`[mod.js]: Error creating or sending pet reset embed:`, error);
      handleError(error, 'mod.js', {
        commandName: '/mod forceresetpetrolls',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        characterName: character.name,
        petName: petName,
        result: result
      });
      
      return interaction.editReply({
        content: `❌ Failed to create pet reset embed: ${error.message || 'Unknown error'}`,
        ephemeral: true
      });
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

// ------------------- Function: handleBlightOverride -------------------
// Admin override for blight healing in emergencies
async function handleBlightOverride(interaction) {
  const action = interaction.options.getString('action');
  const target = interaction.options.getString('target');
  const level = interaction.options.getInteger('level');
  const reason = interaction.options.getString('reason') || 'Emergency override';

  try {
    // Check for required parameters based on action
    if (action.startsWith('wipe_') && !target) {
      return interaction.editReply({
        content: '❌ **Target required for wipe actions.** Please specify a village name, character name, or "all".',
        ephemeral: true
      });
    }

    if (action.startsWith('set_') && (level === null || level === undefined)) {
      return interaction.editReply({
        content: '❌ **Level required for set actions.** Please specify a blight level (0-10).',
        ephemeral: true
      });
    }

    // Validate target for specific actions
    if (action === 'wipe_village' || action === 'set_village_level') {
      const validVillages = ['rudania', 'inariko', 'vhintl'];
      if (!validVillages.includes(target?.toLowerCase())) {
        return interaction.editReply({
          content: '❌ **Invalid village.** Please specify: rudania, inariko, or vhintl.',
          ephemeral: true
        });
      }
    }

    if (action === 'wipe_character' || action === 'set_character_level') {
      if (!target || target === 'all') {
        return interaction.editReply({
          content: '❌ **Character name required.** Please specify a specific character name.',
          ephemeral: true
        });
      }
    }

    // Build the update query based on action
    let updateQuery = {};
    let affectedCount = 0;
    let actionDescription = '';

    switch (action) {
      case 'wipe_all':
        updateQuery = { $set: { blightLevel: 0, blightPaused: false } };
        actionDescription = 'wiped blight from ALL characters';
        break;

      case 'wipe_village':
        updateQuery = { 
          $set: { blightLevel: 0, blightPaused: false },
          $match: { currentVillage: target.toLowerCase() }
        };
        actionDescription = `wiped blight from all characters in ${target}`;
        break;

      case 'wipe_character':
        const character = await fetchCharacterByName(target);
        if (!character) {
          return interaction.editReply({
            content: `❌ **Character not found:** ${target}`,
            ephemeral: true
          });
        }
        updateQuery = { 
          $set: { blightLevel: 0, blightPaused: false },
          $match: { _id: character._id }
        };
        actionDescription = `wiped blight from character ${target}`;
        break;

      case 'set_all_level':
        updateQuery = { $set: { blightLevel: level, blightPaused: false } };
        actionDescription = `set blight level to ${level} for ALL characters`;
        break;

      case 'set_village_level':
        updateQuery = { 
          $set: { blightLevel: level, blightPaused: false },
          $match: { currentVillage: target.toLowerCase() }
        };
        actionDescription = `set blight level to ${level} for all characters in ${target}`;
        break;

      case 'set_character_level':
        const targetCharacter = await fetchCharacterByName(target);
        if (!targetCharacter) {
          return interaction.editReply({
            content: `❌ **Character not found:** ${target}`,
            ephemeral: true
          });
        }
        updateQuery = { 
          $set: { blightLevel: level, blightPaused: false },
          $match: { _id: targetCharacter._id }
        };
        actionDescription = `set blight level to ${level} for character ${target}`;
        break;

      default:
        return interaction.editReply({
          content: '❌ **Invalid action.** Please select a valid emergency action.',
          ephemeral: true
        });
    }

    // Execute the update
    let result;
    if (action === 'wipe_character' || action === 'set_character_level') {
      // For single character actions, use findByIdAndUpdate
      const characterId = action === 'wipe_character' ? 
        (await fetchCharacterByName(target))._id : 
        (await fetchCharacterByName(target))._id;
      
      result = await Character.findByIdAndUpdate(
        characterId,
        { blightLevel: action.startsWith('wipe_') ? 0 : level, blightPaused: false },
        { new: true }
      );
      affectedCount = result ? 1 : 0;
    } else {
      // For bulk actions, use updateMany
      const filter = {};
      if (action === 'wipe_village' || action === 'set_village_level') {
        filter.currentVillage = target.toLowerCase();
      }
      
      result = await Character.updateMany(filter, {
        blightLevel: action.startsWith('wipe_') ? 0 : level,
        blightPaused: false
      });
      affectedCount = result.modifiedCount;
    }

    // Create confirmation embed
    const confirmationEmbed = new EmbedBuilder()
      .setColor('#FF6B35') // Emergency orange color
      .setTitle('🚨 EMERGENCY BLIGHT OVERRIDE EXECUTED')
      .setDescription(`**${actionDescription}**`)
      .addFields(
        { name: '📊 Characters Affected', value: `${affectedCount}`, inline: true },
        { name: '👤 Admin', value: interaction.user.tag, inline: true },
        { name: '📝 Reason', value: reason, inline: true },
        { name: '⏰ Timestamp', value: new Date().toLocaleString(), inline: true }
      )
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
      .setFooter({ text: 'Emergency Override - Use with caution' })
      .setTimestamp();

    // Log the emergency action
    console.log(`[mod.js]: 🚨 EMERGENCY BLIGHT OVERRIDE - ${interaction.user.tag} ${actionDescription}. Reason: ${reason}. Affected: ${affectedCount} characters.`);

    return interaction.editReply({
      content: `🚨 **EMERGENCY OVERRIDE EXECUTED:** ${actionDescription}`,
      embeds: [confirmationEmbed],
      ephemeral: true
    });

  } catch (error) {
    handleError(error, 'mod.js', {
      commandName: '/mod blightoverride',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      options: {
        action: action,
        target: target,
        level: level,
        reason: reason
      }
    });
    
    console.error('[mod.js]: Error in blight override:', error);
    return interaction.editReply({
      content: '❌ **An error occurred during the emergency override.**',
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
    // Get the village region for filtering monsters
    const { getVillageRegionByName } = require('../../modules/locationsModule');
    const { getMonstersAboveTierByRegion } = require('../../database/db');
    
    const capitalizedVillage = village.charAt(0).toUpperCase() + village.slice(1);
    const villageRegion = getVillageRegionByName(capitalizedVillage);
    
    if (!villageRegion) {
      return interaction.editReply({ content: `❌ **Invalid village: ${capitalizedVillage}**` });
    }

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
      // Check if monster is from the correct region
      if (!isMonsterInRegion(monster, villageRegion)) {
        return interaction.editReply({ content: `❌ **${monster.name} is not found in ${villageRegion} region, but you're trying to trigger a raid in ${capitalizedVillage}.**` });
      }
    } else {
      // Get a random monster from the village's region (tier 5 and above only)
      monster = await getMonstersAboveTierByRegion(5, villageRegion);
      if (!monster || !monster.name || !monster.tier) {
        return interaction.editReply({ content: `❌ **No tier 5+ monsters found in ${villageRegion} region for ${capitalizedVillage}.**` });
      }
    }

    // ------------------- Determine Correct Channel -------------------
    // Map village names to their respective town hall channel IDs
    const villageChannelMap = {
      'rudania': process.env.RUDANIA_TOWNHALL,
      'inariko': process.env.INARIKO_TOWNHALL,
      'vhintl': process.env.VHINTL_TOWNHALL
    };

    const targetChannelId = villageChannelMap[village.toLowerCase()];
    if (!targetChannelId) {
      return interaction.editReply({ content: `❌ **Invalid village: ${capitalizedVillage}**` });
    }

    // Get the target channel
    const targetChannel = interaction.client.channels.cache.get(targetChannelId);
    if (!targetChannel) {
      return interaction.editReply({ content: `❌ **Could not find channel for ${capitalizedVillage}.**` });
    }

    console.log(`[mod.js]: 🎯 Triggering raid for ${monster.name} in ${capitalizedVillage}`);
    console.log(`[mod.js]: 📍 Target channel ID: ${targetChannelId}`);
    console.log(`[mod.js]: 📍 Target channel name: ${targetChannel.name}`);
    
    // Create a modified interaction object that points to the correct channel
    const modifiedInteraction = {
      ...interaction,
      channel: targetChannel,
      client: interaction.client,
      user: interaction.user,
      guild: interaction.guild,
      // Add the followUp method to prevent errors
      followUp: async (options) => {
        return await targetChannel.send(options);
      }
    };
    
    // Trigger the raid in the correct village channel
    const result = await triggerRaid(monster, modifiedInteraction, capitalizedVillage, false);

    if (!result || !result.success) {
      return interaction.editReply({ 
        content: `❌ **Failed to trigger the raid:** ${result?.error || 'Unknown error'}`,
        ephemeral: true
      });
    }

    console.log(`[mod.js]: ✅ Raid triggered successfully in ${capitalizedVillage} channel`);
    
    // Send confirmation message to the mod
    return interaction.editReply({ 
      content: `✅ **Raid triggered successfully!** The raid embed has been posted in the ${capitalizedVillage} town hall channel.`,
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
// ------------------- Function: handleDebuff -------------------
// Applies or removes debuffs from characters with proper date calculation
// ============================================================================

async function handleDebuff(interaction) {
  try {
    const characterName = interaction.options.getString('character');
    const action = interaction.options.getString('action');
    const days = interaction.options.getInteger('days') || 7;
    const reason = interaction.options.getString('reason') || 'Moderator action';

    // ------------------- Fetch Character -------------------
    const character = await fetchCharacterByName(characterName);
    if (!character) {
      return interaction.editReply(`❌ Character **${characterName}** not found.`);
    }

    if (action === 'apply') {
      // ------------------- Apply Debuff -------------------
      // Calculate debuff end date: midnight EST on the specified day after application
      const now = new Date();
      const estDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      // Set to midnight EST X days from now (date only, no time)
      const debuffEndDate = new Date(estDate.getFullYear(), estDate.getMonth(), estDate.getDate() + days, 0, 0, 0, 0);
      
      character.debuff = {
        active: true,
        endDate: debuffEndDate
      };

      await character.save();

      console.log(`[mod.js]: ✅ Applied ${days}-day debuff to ${character.name} (ends: ${debuffEndDate.toISOString()})`);

      // Send DM to user about the debuff
      try {
        const user = await interaction.client.users.fetch(character.userId);
        const debuffEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('⚠️ Debuff Applied ⚠️')
          .setDescription(`**${character.name}** has been debuffed by a moderator.`)
          .addFields(
            {
              name: '🕒 Debuff Duration',
              value: `${days} days`,
              inline: true
            },
            {
              name: '🕒 Debuff Expires',
              value: `<t:${Math.floor(debuffEndDate.getTime() / 1000)}:D>`,
              inline: true
            },
            {
              name: '📝 Reason',
              value: reason,
              inline: false
            }
          )
          .setThumbnail(character.icon)
          .setFooter({ text: 'Moderator Action' })
          .setTimestamp();

        await user.send({ embeds: [debuffEmbed] });
      } catch (dmError) {
        console.warn(`[mod.js]: ⚠️ Could not send DM to user ${character.userId}:`, dmError);
      }

      return interaction.editReply({
        content: `✅ **${character.name}** has been debuffed for **${days} days**.\n🕒 **Expires:** <t:${Math.floor(debuffEndDate.getTime() / 1000)}:D>\n📝 **Reason:** ${reason}`,
        ephemeral: true
      });

    } else if (action === 'remove') {
      // ------------------- Remove Debuff -------------------
      if (!character.debuff?.active) {
        return interaction.editReply(`❌ **${character.name}** is not currently debuffed.`);
      }

      character.debuff.active = false;
      character.debuff.endDate = null;
      await character.save();

      console.log(`[mod.js]: ✅ Removed debuff from ${character.name}`);

      // Send DM to user about the debuff removal
      try {
        const user = await interaction.client.users.fetch(character.userId);
        const removalEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Debuff Removed ✅')
          .setDescription(`**${character.name}**'s debuff has been removed by a moderator.`)
          .addFields(
            {
              name: '📝 Reason',
              value: reason,
              inline: false
            }
          )
          .setThumbnail(character.icon)
          .setFooter({ text: 'Moderator Action' })
          .setTimestamp();

        await user.send({ embeds: [removalEmbed] });
      } catch (dmError) {
        console.warn(`[mod.js]: ⚠️ Could not send DM to user ${character.userId}:`, dmError);
      }

      return interaction.editReply({
        content: `✅ **${character.name}**'s debuff has been removed.\n📝 **Reason:** ${reason}`,
        ephemeral: true
      });
    }

    return interaction.editReply('❌ Invalid action specified. Use `apply` or `remove`.');
  } catch (error) {
    handleError(error, 'mod.js');
    console.error('[mod.js]: Error during debuff handling:', error);
    return interaction.editReply('⚠️ An error occurred while processing the debuff action.');
  }
}

// ============================================================================
// ------------------- Function: handleSheets -------------------
// Manages Google Sheets operations and retry functionality
// ============================================================================

async function handleSheets(interaction) {
  try {
    const action = interaction.options.getString('action');
    
    if (action === 'retry') {
      const pendingCount = await getPendingSheetOperationsCount();
      
      if (pendingCount === 0) {
        return interaction.editReply('✅ No pending Google Sheets operations to retry.');
      }
      
      await interaction.editReply(`🔄 Attempting to retry ${pendingCount} pending operations...`);
      
      const result = await retryPendingSheetOperations();
      
      if (result.success) {
        const embed = new EmbedBuilder()
          .setColor('#88cc88')
          .setTitle('📊 Google Sheets Retry Results')
          .setDescription(`Successfully processed pending operations.`)
          .addFields(
            { name: '✅ Successful', value: result.retried.toString(), inline: true },
            { name: '❌ Failed', value: result.failed.toString(), inline: true },
            { name: '📦 Total Processed', value: (result.retried + result.failed).toString(), inline: true }
          )
          .setTimestamp();
        
        return interaction.editReply({ embeds: [embed] });
      } else {
        return interaction.editReply(`❌ Failed to retry operations: ${result.error}`);
      }
      
    } else if (action === 'status') {
      const pendingCount = await getPendingSheetOperationsCount();
      
      const embed = new EmbedBuilder()
        .setColor(pendingCount > 0 ? '#ffaa00' : '#88cc88')
        .setTitle('📊 Google Sheets Status')
        .setDescription(pendingCount > 0 
          ? `There are **${pendingCount}** pending operations waiting to be retried.`
          : '✅ All Google Sheets operations are up to date.'
        )
        .addFields(
          { name: '📦 Pending Operations', value: pendingCount.toString(), inline: true },
          { name: '🔄 Auto Retry', value: 'Every 15 minutes', inline: true },
          { name: '⏰ Max Retries', value: '3 attempts', inline: true }
        )
        .setTimestamp();
      
      return interaction.editReply({ embeds: [embed] });
      
    } else if (action === 'clear') {
      const TempData = require('../../models/TempDataModel');
      const deleteResult = await TempData.deleteMany({ type: 'pendingSheetOperation' });
      
      const embed = new EmbedBuilder()
        .setColor('#ff6666')
        .setTitle('🗑️ Google Sheets Operations Cleared')
        .setDescription(`Cleared **${deleteResult.deletedCount}** pending operations.`)
        .setTimestamp();
      
      return interaction.editReply({ embeds: [embed] });
    }
    
  } catch (error) {
    console.error('[mod.js]: Error during sheets handling:', error);
    return interaction.editReply('⚠️ An error occurred while processing the sheets action.');
  }
}
// ============================================================================
// ------------------- Export Command -------------------
// ============================================================================

module.exports = {
  data: modCommand,
  execute
};
