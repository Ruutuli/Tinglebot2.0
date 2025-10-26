// ============================================================================
// ------------------- Imports -------------------
// Grouped and alphabetized within each section
// ============================================================================

// ------------------- Node.js Standard Libraries -------------------
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ------------------- Discord.js Components -------------------
const {
  EmbedBuilder,
  PermissionsBitField,
  SlashCommandBuilder
} = require('discord.js');

// ------------------- Database Connections -------------------
const logger = require('../../utils/logger');
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
  fetchModCharacterById,
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

// ------------------- Database Models -------------------
const Character = require('../../models/CharacterModel');
const Minigame = require('../../models/MinigameModel');

// ------------------- Custom Modules -------------------
const { monsterMapping } = require('../../models/MonsterModel');

// ------------------- Utility Functions -------------------
const { handleInteractionError } = require('../../utils/globalErrorHandler');
const { addItemInventoryDatabase, escapeRegExp } = require('../../utils/inventoryUtils');
const { safeInteractionResponse, safeFollowUp, safeSendLongMessage, splitMessage } = require('../../utils/interactionUtils');
const { generateUniqueId } = require('../../utils/uniqueIdUtils');
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
  GAME_CONFIGS,
  createAlienDefenseGame,
  addPlayerToTurnOrder,
  spawnAliens,
  processAlienDefenseRoll,
  advanceAlienDefenseRound,
  checkAlienDefenseGameEnd,
  getAlienDefenseGameStatus,
  getCurrentVillageImage,
  getAlienImage,
  getAvailableVillages,
  getAlienPosition,
  getAlienPositions,
  generateAlienOverlayImage
} = require('../../modules/minigameModule');

const {
  createRaidEmbed,
  startRaid,
  triggerRaid
} = require('../../modules/raidModule');

const {
  generateBlightRollFlavorText,
  generateBlightVictoryFlavorText,
  generateBlightLootFlavorText,
  generateBlightSubmissionExpiryFlavorText
} = require('../../modules/flavorTextModule');

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
  getCommonEmbedSettings,
  createDailyRollsResetEmbed
} = require('../../embeds/embeds.js');

const { createMountEncounterEmbed } = require('../../embeds/embeds.js');
const { generateWeatherEmbed } = require('../../services/weatherService');
const WeatherService = require('../../services/weatherService');


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
    
    // Check if URL is already properly encoded (contains %20, %21, etc.)
    const isAlreadyEncoded = /%[0-9A-Fa-f]{2}/.test(cleaned);
    
    let encodedUrl;
    if (isAlreadyEncoded) {
      // URL is already encoded, use as-is
      encodedUrl = cleaned;
    } else {
      // URL needs encoding
      encodedUrl = encodeURI(cleaned).replace(/!/g, '%21');
    }
    
    // Validate the URL structure
    const urlObj = new URL(encodedUrl);
    
    // Only allow http and https protocols
    if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
      return encodedUrl;
    } else {
      logger.warn('SYSTEM', `Invalid protocol for URL: ${url}`);
      return fallbackUrl;
    }
  } catch (error) {
    logger.error('SYSTEM', `Error processing URL: ${url}`);
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
    handleInteractionError(error, 'mod.js');
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
    handleInteractionError(error, 'mod.js');
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
        { name: '🤝 Collaboration', value: (collab && typeof collab === 'string' && collab.trim() && collab !== 'N/A') || (Array.isArray(collab) && collab.length > 0) ? `Yes - split with ${Array.isArray(collab) ? collab.join(', ') : collab}` : 'No', inline: true }
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
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
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
  
  // Check if collaboration exists (handle both array and legacy string format)
  const hasCollaborators = collab && ((Array.isArray(collab) && collab.length > 0) || (typeof collab === 'string' && collab.trim() && collab !== 'N/A'));
  
  // Add token tracker links for collaboration
  if (hasCollaborators) {
    const collaborators = Array.isArray(collab) ? collab : [collab];
    const totalParticipants = 1 + collaborators.length;
    const splitTokens = Math.floor(tokenAmount / totalParticipants);
    
    // Add main user field
    embed.addFields(
      { 
        name: '💰 Main User Tokens', 
        value: `<@${userId}> received **${splitTokens} tokens**\n${userTrackerLink}`, 
        inline: true 
      }
    );
    
    // Add field for each collaborator
    for (const collaboratorMention of collaborators) {
      const collaboratorId = collaboratorMention.replace(/[<@>]/g, '');
      
      // Get collaborator token tracker URL
      const collaborator = await User.findOne({ discordId: collaboratorId });
      const collabTokenTracker = collaborator?.tokenTracker || 'No token tracker set up';
      const collabTrackerLink = collabTokenTracker !== 'No token tracker set up' ? `[View Token Tracker](${collabTokenTracker})` : 'No token tracker set up';
      
      embed.addFields(
        { 
          name: '💰 Collaborator Tokens', 
          value: `<@${collaboratorId}> received **${splitTokens} tokens**\n${collabTrackerLink}`, 
          inline: true 
        }
      );
    }
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
  if (type === 'rollReset' && result) {
    if (result.oldRolls === undefined || result.newRolls === undefined) {
      console.warn(`[mod.js]: Result object missing oldRolls or newRolls:`, result);
      // Provide fallback values
      result.oldRolls = result.oldRolls ?? 0;
      result.newRolls = result.newRolls ?? 0;
    }
  }

  let config;
  
  if (type === 'levelUpdate') {
    config = {
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
    };
  } else if (type === 'rollReset') {
    config = {
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
    };
  } else {
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
    embed.setThumbnail("https://storage.googleapis.com/tinglebot/Graphics/border.png");
    console.log(`[mod.js]: Using default thumbnail for pet`);
  }

  // Set banner image
  embed.setImage("https://storage.googleapis.com/tinglebot/Graphics/border.png");
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

// ------------------- Subcommand: petrolls -------------------
.addSubcommand(subcommand =>
  subcommand
    .setName('petrolls')
    .setDescription('🔄 Reset pet rolls for all characters or a specific pet')
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('Reset all pets or a specific pet')
        .setRequired(true)
        .addChoices(
          { name: 'Reset All Pet Rolls', value: 'all' },
          { name: 'Reset Specific Pet', value: 'specific' }
        )
    )
    .addStringOption(option =>
      option
        .setName('character')
        .setDescription('The character name (required for specific pet reset)')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('petname')
        .setDescription('The pet name (required for specific pet reset)')
        .setRequired(false)
        .setAutocomplete(true)
    )
)

// ------------------- Subcommand: resetrolls -------------------
.addSubcommand(subcommand =>
  subcommand
    .setName('resetrolls')
    .setDescription('🔄 Reset daily rolls for a specific character')
    .addStringOption(option =>
      option
        .setName('character')
        .setDescription('Name of the character to reset rolls for')
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
// ------------------- Subcommand: blight -------------------
.addSubcommand(sub =>
  sub
    .setName('blight')
    .setDescription('👁️ Set or unset blight for a character')
    .addStringOption(option =>
      option
        .setName('character')
        .setDescription('Name of the character to modify')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addBooleanOption(option =>
      option
        .setName('status')
        .setDescription('True to set blight, false to unset blight')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('stage')
        .setDescription('Blight stage/level (0-5, only used when status is true)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(5)
    )
)

// ------------------- Subcommand: rpposts -------------------
.addSubcommand(sub =>
  sub
    .setName('rpposts')
    .setDescription('📝 Update RP post count for a quest participant')
    .addStringOption(option =>
      option
        .setName('questid')
        .setDescription('ID of the RP quest')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to update post count for')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('count')
        .setDescription('New post count')
        .setRequired(true)
        .setMinValue(0)
    )
)

// ------------------- Subcommand: minigame -------------------
.addSubcommand(sub =>
  sub
    .setName('minigame')
    .setDescription('🎮 Manage minigames')
    .addStringOption(option =>
      option
        .setName('minigame_name')
        .setDescription('Name of the minigame to manage')
        .setRequired(true)
        .addChoices(
          { name: 'They Came for the Cows', value: 'theycame' }
        )
    )
    .addStringOption(option =>
      option
        .setName('village')
        .setDescription('Village where the minigame takes place')
        .setRequired(true)
        .addChoices(
          { name: 'Rudania', value: 'rudania' },
          { name: 'Inariko', value: 'inariko' },
          { name: 'Vhintl', value: 'vhintl' }
        )
    )
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('Action to perform')
        .setRequired(true)
        .addChoices(
          { name: 'Create Game', value: 'create' },
          { name: 'Start Game', value: 'start' },
          { name: 'Advance Round', value: 'advance' },
          { name: 'Skip Turn', value: 'skip' },
          { name: 'End Game', value: 'end' }
        )
    )
    .addStringOption(option =>
      option
        .setName('session_id')
        .setDescription('Game session ID (required for advance/skip/end)')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('skip_character')
        .setDescription('Character name to skip (required for skip action)')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('quest_id')
        .setDescription('Quest ID to tie to the minigame (optional for testing)')
        .setRequired(false)
        .setAutocomplete(true)
    )
)

// ------------------- Subcommand: level -------------------
.addSubcommand(sub =>
  sub
    .setName('level')
    .setDescription('📈 Give XP or set level for a user')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to modify level/XP for')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('Action to perform')
        .setRequired(true)
        .addChoices(
          { name: 'Add XP', value: 'add_xp' },
          { name: 'Set XP', value: 'set_xp' },
          { name: 'Set Level', value: 'set_level' },
          { name: 'Reset Level', value: 'reset_level' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Amount of XP to add/set or level to set')
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the level/XP modification')
        .setRequired(false)
    )
)

// ------------------- Subcommand: villagecheck -------------------
.addSubcommand(sub =>
  sub
    .setName('villagecheck')
    .setDescription('🏘️ Check village locations for all participants in an RP quest')
    .addStringOption(option =>
      option
        .setName('questid')
        .setDescription('ID of the RP quest to check village locations for')
        .setRequired(true)
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

    // Only defer with ephemeral for non-mount and non-weather commands
    try {
      if (subcommand !== 'mount' && subcommand !== 'weather') {
        await interaction.deferReply({ flags: [4096] }); // 4096 is the flag for ephemeral messages
      } else {
        await interaction.deferReply();
      }
    } catch (deferError) {
      console.error('[mod.js]: Failed to defer reply:', deferError);
      // If defer fails, the interaction is likely invalid, so we can't proceed
      return;
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
    } else if (subcommand === 'petrolls') {
        return await handlePetRolls(interaction);
    } else if (subcommand === 'resetrolls') {
        return await handleResetRolls(interaction);
    } else if (subcommand === 'shopadd') {
        return await handleShopAdd(interaction);
    } else if (subcommand === 'trigger-raid') {
        return await handleTriggerRaid(interaction);
    } else if (subcommand === 'blight') {
        return await handleBlight(interaction);
    } else if (subcommand === 'debuff') {
        return await handleDebuff(interaction);
    } else if (subcommand === 'sheets') {
        return await handleSheets(interaction);
    } else if (subcommand === 'rpposts') {
        return await handleRPPosts(interaction);
    } else if (subcommand === 'minigame') {
        return await handleMinigame(interaction);
    } else if (subcommand === 'level') {
        return await handleLevel(interaction);
    } else if (subcommand === 'villagecheck') {
        return await handleVillageCheck(interaction);
    } else {
        return await safeReply(interaction, '❌ Unknown subcommand.');
    }

  } catch (error) {
    await handleInteractionError(error, interaction, {
      source: 'mod.js',
      subcommand: interaction.options?.getSubcommand()
    });
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
  
    const item = await fetchItemByName(itemName, {
      commandName: interaction.commandName,
      userTag: interaction.user?.tag,
      userId: interaction.user?.id,
      operation: 'mod_give_item'
    });
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

    // Note: Google Sheets sync is handled by addItemInventoryDatabase
  
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
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
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
      handleInteractionError(error, 'mod.js', {
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
      handleInteractionError(error, 'mod.js');
      console.error('[mod.js]: Error storing encounter:', error);
      return interaction.editReply('❌ Failed to store encounter. Please try again later.');
    }
  
    const embed = createMountEncounterEmbed(encounterData);
    await interaction.editReply({ embeds: [embed] });
  }
  
  // ------------------- Function: handleQuestCompletionFromSubmission -------------------
// Handles quest completion when an art/writing submission is approved
async function handleQuestCompletionFromSubmission(submission, userId) {
  try {
    const Quest = require('../models/QuestModel');
    const questRewardModule = require('../../modules/questRewardModule');
    
    const questID = submission.questEvent;
    console.log(`[mod.js]: 🎯 Processing quest completion for quest ${questID} and user ${userId}`);
    
    // Find the quest
    const quest = await Quest.findOne({ questID });
    if (!quest) {
      console.log(`[mod.js]: ⚠️ Quest ${questID} not found for submission ${submission.submissionId}`);
      return;
    }
    
    // Check if quest is active
    if (quest.status !== 'active') {
      console.log(`[mod.js]: ⚠️ Quest ${questID} is not active (status: ${quest.status})`);
      return;
    }
    
    // Find the participant
    const participant = quest.getParticipant(userId);
    if (!participant) {
      console.log(`[mod.js]: ⚠️ User ${userId} is not a participant in quest ${questID}`);
      return;
    }
    
    // Check if participant has quest submission info
    if (!participant.questSubmissionInfo) {
      console.log(`[mod.js]: ⚠️ No quest submission info found for user ${userId} in quest ${questID}`);
      return;
    }
    
    // Mark quest as completed for this participant
    participant.progress = 'completed';
    participant.completedAt = new Date();
    participant.completionProcessed = false; // Mark for reward processing
    participant.lastCompletionCheck = new Date();
    
    // Clear the quest submission info since it's been processed
    participant.questSubmissionInfo = null;
    
    // Save the quest with updated participant data
    await quest.save();
    
    // Update quest embed using centralized manager
    try {
        const questModule = require('../world/quest');
        await questModule.updateQuestEmbed(null, quest, interaction.client, 'modAction');
    } catch (error) {
        console.error(`[mod.js] ❌ Error updating quest embed:`, error);
    }
    
    // Use unified completion system
    const completionResult = await quest.checkAutoCompletion();
    
    if (completionResult.completed && completionResult.needsRewardProcessing) {
      console.log(`[mod.js]: ✅ Quest ${questID} completed: ${completionResult.reason}`);
      
      // Distribute rewards for all participants
      await questRewardModule.processQuestCompletion(questID);
      
      // Mark completion as processed to prevent duplicates
      await quest.markCompletionProcessed();
    } else if (completionResult.reason.includes('participants completed')) {
      console.log(`[mod.js]: 📊 ${completionResult.reason} in quest ${questID}`);
    }
    
  } catch (error) {
    console.error(`[mod.js]: ❌ Error in handleQuestCompletionFromSubmission:`, error);
    throw error;
  }
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
      return interaction.editReply({ 
        content: `❌ This submission is missing a message URL and cannot be approved/denied. Submission ID: \`${submissionId}\`\n\nThis may be a corrupted or incomplete submission. Please contact the bot developer if this issue persists.`, 
        ephemeral: true 
      });
    }

    // Validate and parse message URL
    const urlParts = messageUrl.split('/');
    const channelId = urlParts[5];
    const messageId = urlParts[6];
    
    if (!channelId || !messageId) {
      return interaction.editReply({ 
        content: `❌ The message URL for this submission is invalid. Submission ID: \`${submissionId}\`\n\nMessage URL: \`${messageUrl}\`\n\nThis may be a corrupted or incomplete submission. Please contact the bot developer if this issue persists.`, 
        ephemeral: true 
      });
    }

    // Fetch the channel and message
    const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      return interaction.editReply({ 
        content: `❌ Could not find the channel for this submission. The channel may have been deleted. Submission ID: \`${submissionId}\``, 
        ephemeral: true 
      });
    }

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) {
      return interaction.editReply({ 
        content: `❌ Could not find the message for this submission. The message may have been deleted. Submission ID: \`${submissionId}\``, 
        ephemeral: true 
      });
    }
  
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
          taggedCharacters: submission.taggedCharacters || [],
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
          handleInteractionError(dbError, 'mod.js');
          console.error(`[mod.js]: ❌ Failed to save approved submission to database:`, dbError);
          // Continue with token updates even if database save fails
        }

        let tokenErrors = [];
        
        // Check if collaboration exists (handle both array and legacy string format)
        const hasCollaborators = collab && ((Array.isArray(collab) && collab.length > 0) || (typeof collab === 'string' && collab.trim() && collab !== 'N/A'));
        
        if (hasCollaborators) {
          // Handle both array and legacy string format
          const collaborators = Array.isArray(collab) ? collab : [collab];
          const totalParticipants = 1 + collaborators.length; // 1 submitter + collaborators
          const splitTokens = Math.floor(tokenAmount / totalParticipants);

          // Update tokens for the main user
          try {
            await updateTokenBalance(userId, splitTokens);
            await appendEarnedTokens(userId, title, category, splitTokens, messageUrl);
          } catch (tokenError) {
            console.error(`[mod.js]: ❌ Error updating tokens for main user ${userId}:`, tokenError);
            tokenErrors.push(`Main user (${userId})`);
          }

          // Update tokens for each collaborator
          for (const collaboratorMention of collaborators) {
            const collaboratorId = collaboratorMention.replace(/[<@>]/g, '');
            
            try {
              await updateTokenBalance(collaboratorId, splitTokens);
              await appendEarnedTokens(collaboratorId, title, category, splitTokens, messageUrl);
            } catch (tokenError) {
              console.error(`[mod.js]: ❌ Error updating tokens for collaborator ${collaboratorId}:`, tokenError);
              tokenErrors.push(`Collaborator (${collaboratorId})`);
            }
          }

          // Send embed DM to main user
          try {
            const mainUserEmbed = createApprovalDMEmbed(submissionId, title, splitTokens, true);
            await interaction.client.users.send(userId, { embeds: [mainUserEmbed] });
          } catch (dmError) {
            console.error(`[mod.js]: ❌ Error sending DM to main user ${userId}:`, dmError);
          }

          // Send embed DM to each collaborator
          for (const collaboratorMention of collaborators) {
            const collaboratorId = collaboratorMention.replace(/[<@>]/g, '');
            
            try {
              const collabUserEmbed = createCollaborationApprovalDMEmbed(submissionId, title, splitTokens);
              await interaction.client.users.send(collaboratorId, { embeds: [collabUserEmbed] });
            } catch (dmError) {
              console.error(`[mod.js]: ❌ Error sending DM to collaborator ${collaboratorId}:`, dmError);
            }
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

        // ------------------- Blight Healing Completion Logic -------------------
        // Check if this submission is for blight healing and auto-complete it
        if (submission.blightId && submission.blightId !== 'N/A') {
          try {
            console.log(`[mod.js]: Processing blight healing completion for submission ${submissionId} with blightId: ${submission.blightId}`);
            
            const { retrieveBlightRequestFromStorage, deleteBlightRequestFromStorage } = require('../../utils/storage');
            const { completeBlightHealing } = require('../../handlers/blightHandler');
            const { fetchCharacterByName } = require('../../database/db');
            
            // Get the blight healing request
            const blightRequest = await retrieveBlightRequestFromStorage(submission.blightId);
            if (blightRequest && blightRequest.status === 'pending') {
              // Get the character to heal
              const character = await fetchCharacterByName(blightRequest.characterName);
              if (character && character.blighted) {
                console.log(`[mod.js]: Completing blight healing for character: ${character.name}`);
                
                // Complete the blight healing
                await completeBlightHealing(character, interaction);
                
                // Mark the blight request as completed
                blightRequest.status = 'completed';
                blightRequest.submittedAt = new Date().toISOString();
                await deleteBlightRequestFromStorage(submission.blightId);
                
                console.log(`[mod.js]: ✅ Blight healing completed for character: ${character.name}`);
              } else {
                console.log(`[mod.js]: Character ${blightRequest.characterName} not found or not blighted`);
              }
            } else {
              console.log(`[mod.js]: Blight request ${submission.blightId} not found or already processed`);
            }
          } catch (blightError) {
            console.error(`[mod.js]: ❌ Error processing blight healing for submission ${submissionId}:`, blightError);
            // Continue with approval even if blight healing fails
          }
        }

        // ------------------- Quest Completion Logic -------------------
        // Check if this submission is linked to a quest and auto-complete it
        if (submission.questEvent && submission.questEvent !== 'N/A') {
          try {
            // Update submission data with message URL and approval info
            submission.messageUrl = messageUrl;
            submission.approvedBy = interaction.user.tag;
            submission.approvedSubmissionData = true; // Flag to skip approval check
            
            // Try Help Wanted Quest completion first
            const { checkAndCompleteQuestFromSubmission } = require('../../modules/helpWantedModule');
            await checkAndCompleteQuestFromSubmission(submission, interaction.client);
            
            // Check if this is an HWQ (starts with "X") - if so, skip main Quest system processing
            const isHWQ = submission.questEvent.startsWith('X');
            
            if (!isHWQ) {
              // Also try main Quest system completion for Art and Writing quests (non-HWQs only)
              if (submission.category === 'art') {
                const { processArtQuestCompletionFromSubmission } = require('../../modules/questRewardModule');
                const questResult = await processArtQuestCompletionFromSubmission(submission, userId);
                
                if (questResult.success) {
                  console.log(`[mod.js]: ✅ Art quest completion processed for user ${userId}`);
                  if (questResult.questCompleted) {
                    console.log(`[mod.js]: 🎉 Quest ${submission.questEvent} was fully completed!`);
                  }
                } else {
                  console.log(`[mod.js]: ℹ️ No main quest completion needed: ${questResult.reason || questResult.error}`);
                }
              } else if (submission.category === 'writing') {
                const { processWritingQuestCompletionFromSubmission } = require('../../modules/questRewardModule');
                const questResult = await processWritingQuestCompletionFromSubmission(submission, userId);
                
                if (questResult.success) {
                  console.log(`[mod.js]: ✅ Writing quest completion processed for user ${userId}`);
                  if (questResult.questCompleted) {
                    console.log(`[mod.js]: 🎉 Quest ${submission.questEvent} was fully completed!`);
                  }
                } else {
                  console.log(`[mod.js]: ℹ️ No main quest completion needed: ${questResult.reason || questResult.error}`);
                }
              }
            } else {
              console.log(`[mod.js]: ℹ️ Skipping main quest processing for HWQ ${submission.questEvent}`);
            }
          } catch (questError) {
            console.error(`[mod.js]: ❌ Error processing quest completion for submission ${submissionId}:`, questError);
            // Continue with approval even if quest completion fails
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
      handleInteractionError(error, 'mod.js');
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
        handleInteractionError(err, 'mod.js');
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
      handleInteractionError(err, 'mod.js');
      return reply(interaction, '❌ Could not update the original mod message. Edit request remains pending.');
    }

    await deletePendingEditFromStorage(requestId);

    // ------------------- User DM Notification -------------------
    try {
      const user = await interaction.client.users.fetch(pendingEdit.userId);
      const dmMessage = formatUserDM(character.name, pendingEdit.category, pendingEdit.previousValue, pendingEdit.updatedValue);
      await attemptDMWithRetry(user, dmMessage, 3);
    } catch (err) {
      handleInteractionError(err, 'mod.js');
      console.warn(`[mod.js]: Could not DM user ${pendingEdit.userId}`);
    }

    const replyEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✅ Character Edit Request Processed')
      .setDescription(`${character.name}'s ${pendingEdit.category} edit ${shouldApprove ? 'approved' : 'rejected'}!\nRequest ID: \`${requestId}\``)
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setFooter({
        text: `Processed by ${interaction.user.tag}`
      })
      .setTimestamp();

    return reply(interaction, { embeds: [replyEmbed] });
  } catch (error) {
    handleInteractionError(error, 'mod.js');
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
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
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
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
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

// ------------------- Function: safeReply -------------------
// Helper function to safely send replies, handling invalid interactions
async function safeReply(interaction, content, ephemeral = true) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.editReply(content);
    } else {
      const replyContent = typeof content === 'string' ? { content } : content;
      if (ephemeral && !replyContent.ephemeral) {
        replyContent.ephemeral = true;
      }
      return await interaction.reply(replyContent);
    }
  } catch (error) {
    console.error('[mod.js]: Failed to send safe reply:', error);
    return null;
  }
}


// ------------------- Function: handleInactivityReport -------------------
// Generates a report of users inactive for 3+ months, including message counts and last activity.
async function handleInactivityReport(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.editReply("❌ You do not have permission to use this command.");
    }
  
    try {
      await safeInteractionResponse(interaction, { 
        content: "📋 Generating inactivity report... this may take a minute.",
        ephemeral: true 
      });
  
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
  
      const reportContent = `📋 **Users inactive for 3+ months:**\n\n${reportLines.join('\n\n')}`;
      
      // Use the safe utility to send the long message
      await safeSendLongMessage(interaction, reportContent, {
        maxLength: 2000,
        ephemeral: true,
        fallbackToChannel: true
      });
  
      
    } catch (error) {
      console.error('[mod.js]: Error in handleInactivityReport:', error);
      
      // Try to send error message using safe utility
      await safeInteractionResponse(interaction, {
        content: '❌ An error occurred while generating the inactivity report.',
        ephemeral: true,
        fallbackToChannel: true
      });
    }
  }
  

  
  // ------------------- Function: handleBlightPause -------------------
// Pauses blight progression for a given character.
async function handleBlightPause(interaction) {
  const charName = interaction.options.getString('character');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  try {
    const character = await fetchCharacterByName(charName);
    if (!character) {
      return interaction.editReply(`❌ Character **${charName}** not found.`);
    }

    // Check if already paused and update the pause info
    const wasAlreadyPaused = character.blightPaused;
    
    // Store/update pause information
    character.blightPaused = true;
    character.blightPauseInfo = {
      pausedAt: new Date(),
      pausedBy: interaction.user.id,
      pausedByUsername: interaction.user.username,
      reason: reason
    };
    await character.save();

    // Get user mention
    const userMention = `<@${character.userId}>`;
    
    // Create embed response
    const pauseEmbed = new EmbedBuilder()
      .setColor('#FFA500') // Orange color for pause
      .setTitle(wasAlreadyPaused ? '⏸️ Blight Pause Updated' : '⏸️ Blight Progression Paused')
      .setDescription(wasAlreadyPaused ? 
        `Blight pause information has been updated for this character.` : 
        `Blight progression has been successfully paused for this character.`)
      .addFields(
        { name: '👤 Character', value: character.name, inline: true },
        { name: '👥 User', value: userMention, inline: true },
        { name: '🏥 Blight Stage', value: `Stage ${character.blightStage}`, inline: true },
        { name: '⏰ Paused At', value: character.blightPauseInfo.pausedAt.toLocaleString(), inline: false },
        { name: '🛡️ Paused By', value: interaction.user.username, inline: true },
        { name: '📝 Reason', value: reason, inline: true }
      )
      .addFields(
        { name: '💡 To Unpause', value: `Use \`/mod blightunpause character:${character.name}\``, inline: false }
      )
      .setThumbnail(character.icon || 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png')
      .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
      .setFooter({ text: 'Blight Pause Management', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
      .setTimestamp();

    return interaction.editReply({ embeds: [pauseEmbed] });
  } catch (error) {
    handleInteractionError(error, 'mod.js');
    console.error('[mod.js]: Error in handleBlightPause', error);
    return interaction.editReply('❌ An error occurred while processing your request.');
  }
}

// ------------------- Function: handleBlightUnpause -------------------
// Unpauses blight progression for a given character.
async function handleBlightUnpause(interaction) {
  const charName = interaction.options.getString('character');

  try {
    const character = await fetchCharacterByName(charName);
    if (!character) {
      return interaction.editReply(`❌ Character **${charName}** not found.`);
    }

    if (!character.blightPaused) {
      return interaction.editReply(`▶️ Blight progression for **${character.name}** is not currently paused.`);
    }

    // Get pause information before clearing it
    const pauseInfo = character.blightPauseInfo || {};
    const pauseDuration = pauseInfo.pausedAt ? 
      Math.floor((Date.now() - pauseInfo.pausedAt.getTime()) / (1000 * 60 * 60 * 24)) : 0; // Days

    // Clear pause information
    character.blightPaused = false;
    character.blightPauseInfo = undefined;
    await character.save();

    // Get user mention
    const userMention = `<@${character.userId}>`;
    
    // Create embed response
    const unpauseEmbed = new EmbedBuilder()
      .setColor('#00FF00') // Green color for unpause
      .setTitle('▶️ Blight Progression Unpaused')
      .setDescription(`Blight progression has been successfully resumed for this character.`)
      .addFields(
        { name: '👤 Character', value: character.name, inline: true },
        { name: '👥 User', value: userMention, inline: true },
        { name: '🏥 Blight Stage', value: `Stage ${character.blightStage}`, inline: true },
        { name: '⏸️ Was Paused For', value: `${pauseDuration} day(s)`, inline: true },
        { name: '🔄 Unpaused At', value: new Date().toLocaleString(), inline: true },
        { name: '🛡️ Unpaused By', value: interaction.user.username, inline: true }
      )
      .addFields(
        { name: '📝 Original Reason', value: pauseInfo.reason || 'No reason provided', inline: false }
      )
      .setThumbnail(character.icon || 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png')
      .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
      .setFooter({ text: 'Blight Pause Management', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
      .setTimestamp();

    return interaction.editReply({ embeds: [unpauseEmbed] });
  } catch (error) {
    handleInteractionError(error, 'mod.js');
    console.error('[mod.js]: Error in handleBlightUnpause', error);
    return interaction.editReply('❌ An error occurred while processing your request.');
  }
}

// ------------------- Function: handleBlightStatus -------------------
// Shows detailed blight status for a given character.
async function handleBlightStatus(interaction) {
  const charName = interaction.options.getString('character');

  try {
    const character = await fetchCharacterByName(charName);
    if (!character) {
      return interaction.editReply(`❌ Character **${charName}** not found.`);
    }

    if (!character.blighted) {
      return interaction.editReply(`✅ **${character.name}** is not currently afflicted with blight.`);
    }

    // Get user mention
    const userMention = `<@${character.userId}>`;
    
    // Calculate time since blight started
    const blightStartDate = character.blightedAt;
    const daysSinceBlight = blightStartDate ? 
      Math.floor((Date.now() - blightStartDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    
    // Calculate time since last roll
    const lastRollDate = character.lastRollDate;
    const daysSinceLastRoll = lastRollDate ? 
      Math.floor((Date.now() - lastRollDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    
    // Calculate time to death deadline
    const deathDeadline = character.deathDeadline;
    const daysToDeath = deathDeadline ? 
      Math.floor((deathDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;

    // Create embed response
    const statusEmbed = new EmbedBuilder()
      .setColor(character.blightPaused ? '#FFA500' : '#AD1457') // Orange for paused, purple for active
      .setTitle(`📊 Blight Status Report - ${character.name}`)
      .setDescription(`Comprehensive blight status information for this character.`)
      .addFields(
        { name: '👤 Character', value: character.name, inline: true },
        { name: '👥 User', value: userMention, inline: true },
        { name: '🏘️ Current Village', value: character.currentVillage, inline: true },
        { name: '🏥 Blight Stage', value: `Stage ${character.blightStage}`, inline: true },
        { name: '📅 Blight Started', value: blightStartDate ? blightStartDate.toLocaleString() : 'Unknown', inline: true },
        { name: '⏰ Days Since Blight', value: `${daysSinceBlight} day(s)`, inline: true },
        { name: '🎲 Last Roll Date', value: lastRollDate ? lastRollDate.toLocaleString() : 'Never', inline: true },
        { name: '⏳ Days Since Last Roll', value: `${daysSinceLastRoll} day(s)`, inline: true },
        { name: '💀 Death Deadline', value: deathDeadline ? deathDeadline.toLocaleString() : 'Not set', inline: true },
        { name: '⏰ Days Until Death', value: daysToDeath > 0 ? `${daysToDeath} day(s)` : 'Overdue', inline: true }
      );

    // Add pause information if paused
    if (character.blightPaused) {
      const pauseInfo = character.blightPauseInfo || {};
      const pauseDuration = pauseInfo.pausedAt ? 
        Math.floor((Date.now() - pauseInfo.pausedAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      
      statusEmbed.addFields(
        { name: '⏸️ Status', value: '**PAUSED**', inline: false },
        { name: '⏰ Paused At', value: pauseInfo.pausedAt ? pauseInfo.pausedAt.toLocaleString() : 'Unknown', inline: true },
        { name: '🛡️ Paused By', value: pauseInfo.pausedByUsername || 'Unknown', inline: true },
        { name: '⏸️ Pause Duration', value: `${pauseDuration} day(s)`, inline: true },
        { name: '📝 Reason', value: pauseInfo.reason || 'No reason provided', inline: false },
        { name: '💡 To Unpause', value: `Use \`/mod blightunpause character:${character.name}\``, inline: false }
      );
    } else {
      statusEmbed.addFields(
        { name: '▶️ Status', value: '**ACTIVE** - Blight progression is currently active.', inline: false },
        { name: '💡 To Pause', value: `Use \`/mod blightpause character:${character.name} reason:your_reason\``, inline: false }
      );
    }

    statusEmbed
      .setThumbnail(character.icon || 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png')
      .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
      .setFooter({ text: 'Blight Status Report', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
      .setTimestamp();

    return interaction.editReply({ embeds: [statusEmbed] });
  } catch (error) {
    handleInteractionError(error, 'mod.js');
    console.error('[mod.js]: Error in handleBlightStatus', error);
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

  await safeInteractionResponse(interaction, {
    content: '🔍 Checking members...',
    ephemeral: true
  });

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

  const resultContent = `✅ Kicked ${kicked.length} members:\n${kicked.join('\n') || 'None'}`;
  
  // Use safe follow-up to avoid webhook token issues
  await safeFollowUp(interaction, {
    content: resultContent,
    ephemeral: true,
    fallbackToChannel: true
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
    handleInteractionError(error, 'mod.js');
    console.error('[mod.js]: Error resetting vending fields:', error);
    return interaction.editReply('❌ Failed to reset vending fields.');
  }
}

// ------------------- Function: handlePetRolls -------------------
// Handles both resetting all pet rolls and resetting specific pet rolls
async function handlePetRolls(interaction) {
  try {
    const action = interaction.options.getString('action');
    
    if (action === 'all') {
      // Reset all pet rolls for all characters
      const result = await resetPetRollsForAllCharacters();
      
      return interaction.editReply({
        content: `✅ Pet rolls have been manually reset for all active pets.\n📊 Reset ${result.totalPets} pets: ${result.oldRolls} → ${result.newRolls} total rolls`,
        ephemeral: true
      });
    } else if (action === 'specific') {
      // Reset specific pet rolls
      const charName = interaction.options.getString('character');
      const petName = interaction.options.getString('petname');
      
      if (!charName || !petName) {
        return interaction.editReply({
          content: "❌ Character and pet name are required for specific pet reset.",
          ephemeral: true
        });
      }
      
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
        handleInteractionError(error, 'mod.js', {
          commandName: '/mod petrolls',
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
    } else {
      return interaction.editReply({
        content: "❌ Invalid action. Please choose 'all' or 'specific'.",
        ephemeral: true
      });
    }
  } catch (error) {
    handleInteractionError(error, "mod.js", {
      commandName: '/mod petrolls',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      options: {
        subcommand: 'petrolls',
        action: interaction.options.getString('action'),
        character: interaction.options.getString('character'),
        petname: interaction.options.getString('petname')
      }
    });
    
    console.error(`[mod.js]: Error in /mod petrolls:`, error);
    
    return interaction.editReply({
      content: `❌ Failed to reset pet rolls: ${error.message || 'Unknown error'}`,
      ephemeral: true
    });
  }
}

// ------------------- Function: handleResetRolls -------------------
// Resets daily rolls for a specific character so they can roll again
async function handleResetRolls(interaction) {
  try {
    const characterName = interaction.options.getString('character');
    
    // Find the character by name
    const character = await fetchCharacterByName(characterName);
    if (!character) {
      return interaction.editReply({
        content: `❌ Character "${characterName}" not found.`,
        ephemeral: true
      });
    }

    // Check if character has any daily rolls to reset
    if (!character.dailyRoll || character.dailyRoll.size === 0) {
      return interaction.editReply({
        content: `ℹ️ **${character.name}** has no daily rolls to reset.`,
        ephemeral: true
      });
    }

    // Get the current daily rolls for reference
    const rollTypes = Array.from(character.dailyRoll.keys());
    const rollTypesList = rollTypes.map(type => `\`${type}\``).join(', ');

    // Reset the daily rolls
    character.dailyRoll = new Map();
    character.markModified('dailyRoll');
    await character.save();

    // Success response
    return interaction.editReply({
      embeds: [createDailyRollsResetEmbed(character.name, rollTypesList)],
      ephemeral: true
    });

  } catch (error) {
    handleInteractionError(error, 'mod.js', {
      commandName: '/mod resetrolls',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      options: {
        subcommand: 'resetrolls',
        character: interaction.options.getString('character')
      }
    });

    console.error(`[mod.js]: Error in /mod resetrolls:`, error);

    return interaction.editReply({
      content: `❌ Failed to reset rolls for "${interaction.options.getString('character')}": ${error.message || 'Unknown error'}`,
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
    let item;
    if (itemName.includes('+')) {
      item = await ItemModel.findOne({ 
        itemName: itemName
      });
    } else {
      item = await ItemModel.findOne({ 
        itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') }
      });
    }
    
    if (!item) {
      return interaction.editReply(`❌ Item **${itemName}** does not exist in the database.`);
    }

    // Always use database prices
    const finalBuyPrice = item.buyPrice || 0;
    const finalSellPrice = item.sellPrice || 0;

    // Check if item already exists in shop
    let existingShopItem;
    if (itemName.includes('+')) {
      existingShopItem = await VillageShopsModel.findOne({ 
        itemName: itemName
      });
    } else {
      existingShopItem = await VillageShopsModel.findOne({ 
        itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') }
      });
    }

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
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
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
        specialWeather: typeof item.specialWeather === 'object' ? 
          Object.values(item.specialWeather).some(value => value === true) : 
          (item.specialWeather || false),
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
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: `Added by ${interaction.user.tag}` })
          .setTimestamp()],
        ephemeral: true
      });
    }
  } catch (error) {
    handleInteractionError(error, 'mod.js', {
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
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
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
        updateQuery = { $set: { 
          blighted: false, 
          blightedAt: null, 
          blightStage: 0, 
          blightPaused: false,
          lastRollDate: null,
          deathDeadline: null,
          blightEffects: {
            rollMultiplier: 1.0,
            noMonsters: false,
            noGathering: false
          }
        }};
        actionDescription = 'wiped blight from ALL characters';
        break;

      case 'wipe_village':
        updateQuery = { 
          $set: { 
            blighted: false, 
            blightedAt: null, 
            blightStage: 0, 
            blightPaused: false,
            lastRollDate: null,
            deathDeadline: null,
            blightEffects: {
              rollMultiplier: 1.0,
              noMonsters: false,
              noGathering: false
            }
          },
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
          $set: { 
            blighted: false, 
            blightedAt: null, 
            blightStage: 0, 
            blightPaused: false,
            lastRollDate: null,
            deathDeadline: null,
            blightEffects: {
              rollMultiplier: 1.0,
              noMonsters: false,
              noGathering: false
            }
          },
          $match: { _id: character._id }
        };
        actionDescription = `wiped blight from character ${target}`;
        break;

      case 'set_all_level':
        updateQuery = { $set: { blighted: true, blightedAt: new Date(), blightStage: level, blightPaused: false } };
        actionDescription = `set blight level to ${level} for ALL characters`;
        break;

      case 'set_village_level':
        updateQuery = { 
          $set: { blighted: true, blightedAt: new Date(), blightStage: level, blightPaused: false },
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
          $set: { blighted: true, blightedAt: new Date(), blightStage: level, blightPaused: false },
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
        { 
          blighted: !action.startsWith('wipe_'),
          blightedAt: action.startsWith('wipe_') ? null : new Date(),
          blightStage: action.startsWith('wipe_') ? 0 : level, 
          blightPaused: false,
          lastRollDate: action.startsWith('wipe_') ? null : undefined,
          deathDeadline: action.startsWith('wipe_') ? null : undefined,
          blightEffects: action.startsWith('wipe_') ? {
            rollMultiplier: 1.0,
            noMonsters: false,
            noGathering: false
          } : undefined
        },
        { new: true }
      );
      affectedCount = result ? 1 : 0;

      // Handle role management for single character actions
      if (action === 'wipe_character' && result) {
        try {
          const otherBlightedCharacters = await Character.find({
            userId: result.userId,
            blighted: true,
            _id: { $ne: result._id }
          });

          const guild = interaction.guild;
          if (guild) {
            const member = await guild.members.fetch(result.userId);
            
            if (otherBlightedCharacters.length === 0) {
              // No other blighted characters, remove the role
              await member.roles.remove('798387447967907910');
              console.log(`[mod.js]: ✅ Removed blight role from user ${result.userId} via override - no other blighted characters`);
            } else {
              console.log(`[mod.js]: ⚠️ Kept blight role on user ${result.userId} via override - has ${otherBlightedCharacters.length} other blighted character(s)`);
            }
          }
        } catch (roleError) {
          console.warn(`[mod.js]: ⚠️ Could not manage blight role for user ${result.userId} via override:`, roleError);
        }
      } else if (action === 'set_character_level' && result) {
        try {
          const guild = interaction.guild;
          if (guild) {
            const member = await guild.members.fetch(result.userId);
            await member.roles.add('798387447967907910');
            console.log(`[mod.js]: ✅ Added blight role to user ${result.userId} via override for character ${result.name}`);
          }
        } catch (roleError) {
          console.warn(`[mod.js]: ⚠️ Could not add blight role to user ${result.userId} via override:`, roleError);
        }
      }
    } else {
      // For bulk actions, use updateMany
      const filter = {};
      if (action === 'wipe_village' || action === 'set_village_level') {
        filter.currentVillage = target.toLowerCase();
      }
      
      result = await Character.updateMany(filter, {
        blighted: !action.startsWith('wipe_'),
        blightedAt: action.startsWith('wipe_') ? null : new Date(),
        blightStage: action.startsWith('wipe_') ? 0 : level,
        blightPaused: false,
        lastRollDate: action.startsWith('wipe_') ? null : undefined,
        deathDeadline: action.startsWith('wipe_') ? null : undefined,
        blightEffects: action.startsWith('wipe_') ? {
          rollMultiplier: 1.0,
          noMonsters: false,
          noGathering: false
        } : undefined
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
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
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
    handleInteractionError(error, 'mod.js', {
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
      // Check if it's a cooldown error
      if (result?.error && result.error.includes('Raid cooldown active')) {
        return interaction.editReply({ 
          content: `⏰ **${result.error}**`,
          ephemeral: true
        });
      }
      
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
    handleInteractionError(error, 'mod.js', {
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
      // Convert to UTC to ensure proper storage and retrieval
      const debuffEndDate = new Date(Date.UTC(estDate.getFullYear(), estDate.getMonth(), estDate.getDate() + days, 5, 0, 0, 0)); // 5 AM UTC = midnight EST
      
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
    handleInteractionError(error, 'mod.js');
    console.error('[mod.js]: Error during debuff handling:', error);
    return interaction.editReply('⚠️ An error occurred while processing the debuff action.');
  }
}

// ============================================================================
// ------------------- Function: handleBlight -------------------
// Sets or unsets blight for a specific character
// ============================================================================

async function handleBlight(interaction) {
  try {
    const characterName = interaction.options.getString('character');
    const status = interaction.options.getBoolean('status');
    const stage = interaction.options.getInteger('stage') || 1;

    // ------------------- Fetch Character -------------------
    const character = await fetchCharacterByName(characterName);
    if (!character) {
      return interaction.editReply(`❌ Character **${characterName}** not found.`);
    }

    if (status) {
      // ------------------- Set Blight -------------------
      character.blighted = true;
      character.blightedAt = new Date();
      character.blightStage = stage;
      character.blightPaused = false; // Ensure blight is not paused when setting
      await character.save();

      console.log(`[mod.js]: ✅ Set blight stage ${stage} for ${character.name}`);

      // Assign blight role to character owner
      try {
        const guild = interaction.guild;
        if (guild) {
          const member = await guild.members.fetch(character.userId);
          await member.roles.add('798387447967907910');
          console.log(`[mod.js]: ✅ Added blight role to user ${character.userId} for character ${character.name}`);
        }
      } catch (roleError) {
        console.warn(`[mod.js]: ⚠️ Could not assign blight role to user ${character.userId}:`, roleError);
      }

      // Generate flavor text for blight application
      const flavorText = generateBlightRollFlavorText(stage, 'combat');
      
      // Get village-specific styling
      const villageColor = getVillageColorByName(character.currentVillage) || '#8B0000';
      const villageEmoji = getVillageEmojiByName(character.currentVillage) || '🏰';
      
      // Get stage-specific emoji and color
      const stageEmoji = stage === 5 ? '☠️' : 
                        stage === 4 ? '💀' :
                        stage === 3 ? '👻' :
                        stage === 2 ? '🎯' : '⚠️';
      
      const stageColor = stage === 5 ? '#FF0000' :
                        stage === 4 ? '#FF4500' :
                        stage === 3 ? '#FF8C00' :
                        stage === 2 ? '#FFD700' : '#FFFF00';

      // Send DM to user about the blight
      try {
        const user = await interaction.client.users.fetch(character.userId);
        
        // Get character stats for context
        const characterStats = `❤️ **Hearts:** ${character.currentHearts}/${character.maxHearts} | 🟩 **Stamina:** ${character.currentStamina}/${character.maxStamina}`;
        
        // Create enhanced blight application DM embed
        const blightEmbed = new EmbedBuilder()
          .setColor(stageColor)
          .setTitle(`${stageEmoji} The Corruption Takes Hold ${stageEmoji}`)
          .setDescription(`**${character.name}** has been afflicted with **blight stage ${stage}** by a moderator.\n\n${villageEmoji} **Village:** ${character.currentVillage}\n⚔️ **Job:** ${character.job}\n${characterStats}`)
          .addFields(
            {
              name: `${stageEmoji} Blight Stage ${stage}`,
              value: `The corruption has taken hold of your character...`,
              inline: true
            },
            {
              name: '⏰ Progression',
              value: 'Blight will progress naturally unless paused by a moderator.',
              inline: true
            },
            {
              name: '🏥 Healing Required',
              value: 'Seek immediate healing from a Mod Character before the corruption consumes you entirely.',
              inline: true
            },
            {
              name: '💀 The Corruption',
              value: flavorText,
              inline: false
            },
            {
              name: '⚠️ Critical Warning',
              value: 'If blight reaches stage 5, your character will be permanently lost. Act quickly to prevent this fate.',
              inline: false
            }
          )
          .setThumbnail(character.icon)
          .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
          .setFooter({ text: 'Moderator Action • Blight System', iconURL: 'https://storage.googleapis.com/tinglebot/blight-icon.png' })
          .setTimestamp();

        await user.send({ content: `<@${character.userId}>, your character has been afflicted with blight!`, embeds: [blightEmbed] });
      } catch (dmError) {
        console.warn(`[mod.js]: ⚠️ Could not send DM to user ${character.userId}:`, dmError);
      }

      // Create enhanced ephemeral reply for moderator
      const moderatorReplyEmbed = new EmbedBuilder()
        .setColor(stageColor)
        .setTitle(`${stageEmoji} Blight Application Complete ${stageEmoji}`)
        .setDescription(`**${character.name}** has been successfully afflicted with blight stage ${stage}.`)
        .addFields(
          {
            name: '__👤 Character__',
            value: character.name,
            inline: false
          },
          {
            name: '__🏰 Village__',
            value: `${villageEmoji} ${character.currentVillage.charAt(0).toUpperCase() + character.currentVillage.slice(1)}`,
            inline: false
          },
          {
            name: '__⚔️ Job__',
            value: character.job.charAt(0).toUpperCase() + character.job.slice(1),
            inline: false
          },
          {
            name: '__<:blight_eye:805576955725611058> Blight Stage__',
            value: `${stageEmoji} Stage ${stage}`,
            inline: false
          },
          {
            name: '__⚠️ Status__',
            value: 'Blight successfully applied',
            inline: false
          },
          {
            name: '__💀 The Corruption__',
            value: flavorText,
            inline: false
          }
        )
        .setThumbnail(character.icon)
        .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
        .setFooter({ text: 'Moderator Action • Blight System', iconURL: 'https://storage.googleapis.com/tinglebot/blight-icon.png' })
        .setTimestamp();

      return interaction.editReply({
        content: `<@${character.userId}>`,
        embeds: [moderatorReplyEmbed],
        ephemeral: true
      });

    } else {
      // ------------------- Unset Blight -------------------
      if (character.blightStage === 0) {
        return interaction.editReply(`❌ **${character.name}** is not currently afflicted with blight.`);
      }

      const previousStage = character.blightStage || 0;
      character.blighted = false;
      character.blightedAt = null;
      character.blightStage = 0;
      character.blightPaused = false;
      character.lastRollDate = null;
      character.deathDeadline = null;
      character.blightEffects = {
        rollMultiplier: 1.0,
        noMonsters: false,
        noGathering: false
      };
      await character.save();

      console.log(`[mod.js]: ✅ Removed blight (was stage ${previousStage}) from ${character.name}`);

      // Check if user has any other blighted characters before removing role
      try {
        const otherBlightedCharacters = await Character.find({
          userId: character.userId,
          blighted: true,
          _id: { $ne: character._id } // Exclude the current character
        });

        const guild = interaction.guild;
        if (guild) {
          const member = await guild.members.fetch(character.userId);
          
          if (otherBlightedCharacters.length === 0) {
            // No other blighted characters, remove the role
            await member.roles.remove('798387447967907910');
            console.log(`[mod.js]: ✅ Removed blight role from user ${character.userId} - no other blighted characters`);
          } else {
            console.log(`[mod.js]: ⚠️ Kept blight role on user ${character.userId} - has ${otherBlightedCharacters.length} other blighted character(s)`);
          }
        }
      } catch (roleError) {
        console.warn(`[mod.js]: ⚠️ Could not manage blight role for user ${character.userId}:`, roleError);
      }

      // Generate flavor text for blight removal
      const flavorText = generateBlightVictoryFlavorText(previousStage);
      
      // Get village-specific styling
      const villageColor = getVillageColorByName(character.currentVillage) || '#00FF00';
      const villageEmoji = getVillageEmojiByName(character.currentVillage) || '🏰';
      
      // Get previous stage emoji for context
      const previousStageEmoji = previousStage === 5 ? '☠️' : 
                                previousStage === 4 ? '💀' :
                                previousStage === 3 ? '👻' :
                                previousStage === 2 ? '🎯' : '⚠️';

      // Send DM to user about the blight removal
      try {
        const user = await interaction.client.users.fetch(character.userId);
        
        // Get character stats for context
        const characterStats = `❤️ **Hearts:** ${character.currentHearts}/${character.maxHearts} | 🟩 **Stamina:** ${character.currentStamina}/${character.maxStamina}`;
        
        // Create enhanced blight removal DM embed
        const removalEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✨ The Corruption is Cleansed ✨')
          .setDescription(`**${character.name}** has been **completely cleansed of blight** by a moderator.\n\n${villageEmoji} **Village:** ${character.currentVillage}\n⚔️ **Job:** ${character.job}\n${characterStats}`)
          .addFields(
            {
              name: '🔄 Previous Stage',
              value: `${previousStageEmoji} Stage ${previousStage}`,
              inline: true
            },
            {
              name: '⏰ Status',
              value: 'Blight progression has been completely halted.',
              inline: true
            },
            {
              name: '🏥 Recovery Complete',
              value: 'Your character is now fully healed and free from corruption.',
              inline: true
            },
            {
              name: '✨ The Cleansing',
              value: flavorText,
              inline: false
            },
            {
              name: '🎉 Freedom Restored',
              value: 'You are now completely free from the corruption. Your character can continue their journey without any blight influence and is no longer at risk of permanent loss.',
              inline: false
            }
          )
          .setThumbnail(character.icon)
          .setImage('https://storage.googleapis.com/tinglebot/border%20healing.png')
          .setFooter({ text: 'Moderator Action • Blight System', iconURL: 'https://storage.googleapis.com/tinglebot/healing-icon.png' })
          .setTimestamp();

        await user.send({ content: `<@${character.userId}>, your character has been cleansed of blight!`, embeds: [removalEmbed] });
      } catch (dmError) {
        console.warn(`[mod.js]: ⚠️ Could not send DM to user ${character.userId}:`, dmError);
      }

      // Create enhanced ephemeral reply for moderator
      const moderatorReplyEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✨ Blight Removal Complete ✨')
        .setDescription(`**${character.name}** has been successfully cleansed of blight.`)
        .addFields(
          {
            name: '__👤 Character__',
            value: `> ${character.name}`,
            inline: true
          },
          {
            name: '__🏰 Village__',
            value: `> ${villageEmoji} ${character.currentVillage.charAt(0).toUpperCase() + character.currentVillage.slice(1)}`,
            inline: true
          },
          {
            name: '__⚔️ Job__',
            value: `> ${character.job.charAt(0).toUpperCase() + character.job.slice(1)}`,
            inline: true
          },
          {
            name: '__🔄 Previous Stage__',
            value: `> ${previousStageEmoji} Stage ${previousStage}`,
            inline: true
          },
          {
            name: '__👤 Owner__',
            value: `> <@${character.userId}>`,
            inline: true
          },
          {
            name: '__✅ Status__',
            value: '> Blight successfully removed',
            inline: true
          },
          {
            name: '__✨ Healing Complete__',
            value: '> Your character has been fully healed and is now free from corruption. They can continue their journey without any blight influence.',
            inline: false
          }
        )
        .setThumbnail(character.icon)
        .setImage('https://storage.googleapis.com/tinglebot/border%20healing.png')
        .setFooter({ text: 'Moderator Action • Blight System', iconURL: 'https://storage.googleapis.com/tinglebot/healing-icon.png' })
        .setTimestamp();

      return interaction.editReply({
        embeds: [moderatorReplyEmbed],
        ephemeral: true
      });
    }

  } catch (error) {
    handleInteractionError(error, 'mod.js');
    console.error('[mod.js]: Error during blight handling:', error);
    return interaction.editReply('⚠️ An error occurred while processing the blight action.');
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
// ------------------- Function: handleRPPosts -------------------
// Updates RP post count for a quest participant
// ============================================================================

async function handleRPPosts(interaction) {
  try {
    const questID = interaction.options.getString('questid');
    const user = interaction.options.getUser('user');
    const newCount = interaction.options.getInteger('count');

    const { updateRPPostCount } = require('../../modules/rpQuestTrackingModule');
    const result = await updateRPPostCount(questID, user.id, newCount);

    if (result.success) {
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ RP Post Count Updated')
        .setDescription(`Updated RP post count for **${user.username}** in quest **${questID}**`)
        .addFields(
          { name: 'Quest ID', value: questID, inline: true },
          { name: 'User', value: user.username, inline: true },
          { name: 'Old Count', value: result.oldCount.toString(), inline: true },
          { name: 'New Count', value: result.newCount.toString(), inline: true },
          { name: 'Meets Requirements', value: result.meetsRequirements ? '✅ Yes' : '❌ No', inline: true }
        )
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
        .setFooter({ text: `Updated by ${interaction.user.tag}` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed], ephemeral: true });
    } else {
      return interaction.editReply({
        content: `❌ Failed to update RP post count: ${result.error}`,
        ephemeral: true
      });
    }

  } catch (error) {
    handleInteractionError(error, 'mod.js', {
      commandName: '/mod rpposts',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      questID: interaction.options.getString('questid')
    });

    return interaction.editReply({
      content: '❌ An error occurred while updating RP post count.',
      ephemeral: true
    });
  }
}


// ============================================================================
// ------------------- Minigame Handler -------------------
// ============================================================================

async function handleMinigame(interaction) {
  try {
    const minigameName = interaction.options.getString('minigame_name');
    const action = interaction.options.getString('action');
    const sessionId = interaction.options.getString('session_id');
    const questId = interaction.options.getString('quest_id');
    
    switch (minigameName) {
      case 'theycame':
        return await handleTheyCame(interaction, action, sessionId, questId);
      default:
        return interaction.editReply({
          content: '❌ Unknown minigame type.'
        });
    }
  } catch (error) {
    handleInteractionError(error, 'mod.js', {
      commandName: '/mod minigame',
      userTag: interaction.user.tag,
      userId: interaction.user.id
    });
    throw error;
  }
}

// ============================================================================
// ------------------- They Came for the Cows Handler -------------------
// ============================================================================

async function handleTheyCame(interaction, action, sessionId, questId) {
  try {
    const village = interaction.options.getString('village');
    
    switch (action) {
      case 'create':
        return await handleCreateMinigame(interaction, questId, village);
        
      case 'start':
        if (!sessionId) {
          return interaction.editReply({
            content: '❌ Session ID is required for start action.'
          });
        }
        // Extract session ID from autocomplete format if needed
        const sessionIdMatch = sessionId.match(/A\d+/);
        const cleanSessionId = sessionIdMatch ? sessionIdMatch[0] : sessionId;
        return await handleTheyCameStart(interaction, cleanSessionId);
        
      case 'advance':
        if (!sessionId) {
          return interaction.editReply({
            content: '❌ Session ID is required for advance action.'
          });
        }
        // Extract session ID from autocomplete format if needed
        const advanceSessionIdMatch = sessionId.match(/A\d+/);
        const cleanAdvanceSessionId = advanceSessionIdMatch ? advanceSessionIdMatch[0] : sessionId;
        return await handleTheyCameAdvance(interaction, cleanAdvanceSessionId);
        
      case 'skip':
        if (!sessionId) {
          return interaction.editReply({
            content: '❌ Session ID is required for skip action.'
          });
        }
        const characterName = interaction.options.getString('skip_character');
        if (!characterName) {
          return interaction.editReply({
            content: '❌ Character name is required for skip action.'
          });
        }
        // Extract session ID from autocomplete format if needed
        const skipSessionIdMatch = sessionId.match(/A\d+/);
        const cleanSkipSessionId = skipSessionIdMatch ? skipSessionIdMatch[0] : sessionId;
        return await handleTheyCameSkip(interaction, cleanSkipSessionId, characterName);
        
      case 'end':
        if (!sessionId) {
          return interaction.editReply({
            content: '❌ Session ID is required for end action.'
          });
        }
        // Extract session ID from autocomplete format if needed
        const endSessionIdMatch = sessionId.match(/A\d+/);
        const cleanEndSessionId = endSessionIdMatch ? endSessionIdMatch[0] : sessionId;
        return await handleTheyCameEnd(interaction, cleanEndSessionId);
        
      default:
        return interaction.editReply({
          content: '❌ Invalid action. Use create, start, advance, or end.'
        });
    }
  } catch (error) {
    handleInteractionError(error, 'mod.js', {
      commandName: '/mod minigame theycame',
      userTag: interaction.user.tag,
      userId: interaction.user.id
    });
    throw error;
  }
}

async function handleTheyCameStart(interaction, sessionId) {
  // Find the specific session - allow both waiting and active sessions
  const session = await Minigame.findOne({
    sessionId: sessionId,
    gameType: 'theycame',
    status: { $in: ['waiting', 'active'] }
  });
  
  if (!session) {
    return interaction.editReply({
      content: '❌ Game session not found, expired, or already finished.'
    });
  }
  
  // Check if there are players
  if (session.players.length === 0) {
    return interaction.editReply({
      content: '❌ Cannot start game with no players. Players must join first.'
    });
  }
  
  // Handle different session states
  if (session.status === 'waiting') {
    // Starting a new game - spawn initial aliens
    const playerCount = session.gameData.turnOrder.length || session.players.length;
    const spawnResult = spawnAliens(session.gameData, playerCount, 0); // Pass 0 for first turn
    
    // Update session status
    session.gameData.currentRound = 1;
    session.status = 'active';
    
    session.markModified('gameData');
    await session.save();
    
    // Create start embed
    const embedResult = await createMinigameEmbed(session, 'Game Started!');
    const replyOptions = {
      content: `🎮 **Game Started!** ${spawnResult.message}`,
      embeds: [embedResult.embed]
    };
    if (embedResult.attachment) {
      replyOptions.files = [embedResult.attachment];
    }
    
    return interaction.editReply(replyOptions);
  } else if (session.status === 'active') {
    // Game is already active - this might be a round advancement issue
    // Check if we need to spawn more aliens for the current round
    const activeAliens = session.gameData.aliens.filter(a => !a.defeated);
    
    if (activeAliens.length === 0 && session.gameData.currentRound <= session.gameData.maxRounds) {
      // No active aliens but game should continue - spawn for current round
      const playerCount = session.gameData.turnOrder.length || session.players.length;
      const spawnResult = spawnAliens(session.gameData, playerCount, session.gameData.currentRound);
      
      session.markModified('gameData');
      await session.save();
      
      // Use the same embed format as the regular round advance
      const embedResult = await createDetailedMinigameEmbed(session, `Round ${session.gameData.currentRound} Advanced!`, null);
      embedResult.embed.setColor('#FFFFFF'); // White color like the regular advance
      
      // Add spawning information to the embed description
      let description = embedResult.embed.data.description;
      description += `\n\n**🔄 Round complete!** ${spawnResult.message}`;
      
      // Add spawning information if new aliens spawned
      if (spawnResult.spawnLocations && spawnResult.spawnLocations.length > 0) {
        description += `\n\n__👾 New Aliens Spawned:__\n${spawnResult.spawnLocations.join('\n')}`;
      }
      
      embedResult.embed.setDescription(description);
      
      const replyOptions = {
        embeds: [embedResult.embed]
      };
      if (embedResult.attachment) {
        replyOptions.files = [embedResult.attachment];
      }
      
      return interaction.editReply(replyOptions);
    } else {
      // Game is active and has aliens - just show current status
      const embedResult = await createMinigameEmbed(session, 'Game Status');
      const replyOptions = {
        content: `🎮 **Game is already active!** Current round: ${session.gameData.currentRound}`,
        embeds: [embedResult.embed]
      };
      if (embedResult.attachment) {
        replyOptions.files = [embedResult.attachment];
      }
      
      return interaction.editReply(replyOptions);
    }
  }
}

async function handleTheyCameAdvance(interaction, sessionId) {
  // Find the specific session
  const session = await Minigame.findOne({
    sessionId: sessionId,
    gameType: 'theycame',
    status: { $in: ['waiting', 'active'] }
  });
  
  if (!session) {
    return interaction.editReply({
      content: '❌ Game session not found, expired, or already finished.'
    });
  }
  
  // If this is the first round, spawn initial aliens
  if (session.gameData.currentRound === 0) {
    const playerCount = session.gameData.turnOrder.length || session.players.length;
    const spawnResult = spawnAliens(session.gameData, playerCount, 0); // Pass 0 for first turn
    session.gameData.currentRound = 1;
    session.status = 'active';
  }
  
  // Advance the round
  const result = advanceAlienDefenseRound(session.gameData);
  
  if (result.success) {
    // Check if game should end
    const gameEndCheck = checkAlienDefenseGameEnd(session.gameData);
    if (gameEndCheck.gameEnded) {
      session.status = 'finished';
      session.results.finalScore = gameEndCheck.finalScore;
      session.results.completedAt = new Date();
    }
    
    session.markModified('gameData');
    await session.save();
    
    // Delete the finished session immediately after saving if game ended
    if (gameEndCheck.gameEnded) {
      await Minigame.deleteOne({ _id: session._id });
      console.log(`[MOD] Finished minigame session ${session.sessionId} deleted from database`);
    }
    
    const embedResult = await createMinigameEmbed(session, 'Round Advanced!');
    const replyOptions = {
      content: result.message,
      embeds: [embedResult.embed]
    };
    if (embedResult.attachment) {
      replyOptions.files = [embedResult.attachment];
    }
    return interaction.editReply(replyOptions);
  } else {
    return interaction.editReply({
      content: result.message
    });
  }
}

async function handleTheyCameEnd(interaction, sessionId) {
  // Find the specific session
  const session = await Minigame.findOne({
    sessionId: sessionId,
    gameType: 'theycame',
    status: { $in: ['waiting', 'active'] }
  });
  
  if (!session) {
    return interaction.editReply({
      content: '❌ Game session not found, expired, or already finished.'
    });
  }
  
  // End the game
  session.status = 'finished';
  session.results.finalScore = session.gameData.villageAnimals;
  session.results.completedAt = new Date();
  
  await session.save();
  
  // Delete the finished session immediately after saving
  await Minigame.deleteOne({ _id: session._id });
  console.log(`[MOD] Finished minigame session ${session.sessionId} deleted from database`);
  
  const embedResult = await createMinigameEmbed(session, 'Game Ended!');
  const replyOptions = {
    content: `🏁 **Game ended by ${interaction.user.username}!** Final score: ${session.gameData.villageAnimals} animals saved!`,
    embeds: [embedResult.embed]
  };
  if (embedResult.attachment) {
    replyOptions.files = [embedResult.attachment];
  }
  return interaction.editReply(replyOptions);
}

// ============================================================================
// ------------------- Skip Turn Handler -------------------
// ============================================================================

async function handleTheyCameSkip(interaction, sessionId, characterName) {
  // Find the specific session
  const session = await Minigame.findOne({
    sessionId: sessionId,
    gameType: 'theycame',
    status: 'active'
  });
  
  if (!session) {
    return interaction.editReply({
      content: '❌ Game session not found, expired, or not active.'
    });
  }
  
  // Find the character in the turn order
  const turnOrderIndex = session.gameData.turnOrder.findIndex(player => 
    player.username === characterName || player.characterName === characterName
  );
  
  if (turnOrderIndex === -1) {
    return interaction.editReply({
      content: `❌ Character "${characterName}" not found in the current game.`
    });
  }
  
  // Check if it's actually their turn
  if (session.gameData.currentTurnIndex !== turnOrderIndex) {
    return interaction.editReply({
      content: `❌ It's not ${characterName}'s turn. Current turn: ${session.gameData.turnOrder[session.gameData.currentTurnIndex].username}`
    });
  }
  
  // Advance to next player's turn
  session.gameData.currentTurnIndex = (session.gameData.currentTurnIndex + 1) % session.gameData.turnOrder.length;
  
  session.markModified('gameData');
  await session.save();
  
  // Get next player for notification
  const nextPlayer = session.gameData.turnOrder[session.gameData.currentTurnIndex];
  
  const embedResult = await createMinigameEmbed(session, 'Turn Skipped!');
  const replyOptions = {
    content: `⏭️ **${characterName}'s turn skipped by ${interaction.user.username}!** Next turn: **${nextPlayer.username}**`,
    embeds: [embedResult.embed]
  };
  if (embedResult.attachment) {
    replyOptions.files = [embedResult.attachment];
  }
  
  return interaction.editReply(replyOptions);
}

// ============================================================================
// ------------------- Create Game Handler -------------------
// ============================================================================

async function handleCreateMinigame(interaction, questId, village) {
  const channelId = interaction.channelId;
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  
  // TODO: Make quest ID required after testing - currently optional for testing
  let quest = null;
  if (questId) {
    // Special case for testing - allow "TEST" quest ID to bypass validation
    if (questId === 'TEST') {
      console.log(`[MINIGAME CREATE] Using TEST quest ID - bypassing quest validation`);
    } else {
      // Validate quest exists if provided
      const Quest = require('../../models/QuestModel');
      quest = await Quest.findOne({ questID: questId });
      
      if (!quest) {
        return interaction.editReply({
          content: `❌ Quest with ID "${questId}" not found. Please check the quest ID and try again.`
        });
      }
    }
  }
  
  // Village is now required from the command option
  const selectedVillage = village;
  
  // Validate village is one of the supported options
  const validVillages = ['rudania', 'inariko', 'vhintl'];
  if (!validVillages.includes(selectedVillage)) {
    return interaction.editReply({
      content: `❌ Invalid village "${selectedVillage}". Must be one of: ${validVillages.join(', ')}`
    });
  }
  
  // Check if there's already an active session in this channel
  const existingSession = await Minigame.findOne({
    channelId: channelId,
    gameType: 'theycame',
    status: { $in: ['waiting', 'active'] }
  });
  
  if (existingSession) {
    return interaction.editReply({
      content: `❌ There's already an active "They Came for the Cows" session in this channel (ID: ${existingSession.sessionId})`
    });
  }
  
  // Create new game session with unique ID
  const gameSession = createAlienDefenseGame(channelId, guildId, userId, selectedVillage);
  gameSession.sessionId = generateUniqueId('A'); // Generate unique ID for alien defense
  gameSession.questId = questId; // Store the quest ID
  gameSession.village = selectedVillage; // Store the selected village
  
  const newSession = new Minigame(gameSession);
  await newSession.save();
  
  const result = await createMinigameEmbed(newSession, 'Game Created!');
  
  // Create instructions embed
  const villageDisplayName = selectedVillage.charAt(0).toUpperCase() + selectedVillage.slice(1);
  const villageEmoji = getVillageEmojiByName(selectedVillage) || '';
  const instructionsEmbed = new EmbedBuilder()
    .setTitle(`👽 They Came for the Cows - ${villageDisplayName} Village Defense`)
    .setColor(0x00ff00)
    .setDescription(`**Session:** \`${newSession.sessionId}\` • **Village:** ${villageEmoji} ${villageDisplayName}\n\n*Defend your village from alien invaders! Work together to protect 25 animals from being stolen.*`)
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .addFields(
      { 
        name: '🎮 How to Play', 
        value: `**Join:** </minigame theycame-join:1413815457118556201>\n**Attack:** </minigame theycame-roll:1413815457118556201>\n\n**Target Aliens:**\n• Outer Ring (5+ to hit) • Middle Ring (4+ to hit) • Inner Ring (3+ to hit)\n\n🆘 **Want to help but not signed up?** Use \`RINGER\` in quest id to help!`, 
        inline: false 
      },
      { 
        name: '🎲 Rules', 
        value: `**Movement:** 1A → 2A → 3A → Steal Animal\n**Turns:** Players act in sign-up order\n**Victory:** Protect all 25 animals!\n**Max Players:** 6`, 
        inline: true 
      },
      { 
        name: '⚙️ Admin', 
        value: `</mod minigame:1413434285934903366>\n**Session:** \`${newSession.sessionId}\`${newSession.questId ? `\n**Quest ID:** \`${newSession.questId}\`` : ''}`, 
        inline: true 
      }
    )
    .setFooter({ text: '🎮 Click commands to participate! • Good luck defending your village!' })
    .setTimestamp();
  
  const replyOptions = {
    embeds: [instructionsEmbed, result.embed]
  };
  if (result.attachment) {
    replyOptions.files = [result.attachment];
  }
  
  const reply = await interaction.editReply(replyOptions);
  
  // Store the message ID for future updates
  newSession.messageId = reply.id;
  await newSession.save();
  
  return reply;
}

// ============================================================================
// ------------------- Sign Up Handler -------------------
// ============================================================================

async function handleSignUpMinigame(interaction) {
  const sessionId = interaction.options.getString('session_id');
  const userId = interaction.user.id;
  const username = interaction.user.username;
  
  if (!sessionId) {
    return interaction.editReply({
      content: '❌ Please provide a session ID to sign up for a specific game.'
    });
  }
  
  // Find the specific session
  const session = await Minigame.findOne({
    sessionId: sessionId,
    gameType: 'theycame',
    status: { $in: ['waiting', 'active'] }
  });
  
  if (!session) {
    return interaction.editReply({
      content: '❌ Game session not found, expired, or already finished.'
    });
  }
  
  // Add player to turn order
  const result = addPlayerToTurnOrder(session.gameData, userId, username);
  
  if (result.success) {
    // Also add to players list if not already there
    const alreadyJoined = session.players.find(p => p.discordId === userId);
    if (!alreadyJoined) {
      session.players.push({
        discordId: userId,
        username: username,
        joinedAt: new Date()
      });
    }
    
    await session.save();
    
    return interaction.editReply({
      content: result.message
    });
  } else {
    return interaction.editReply({
      content: result.message
    });
  }
}

// ============================================================================
// ------------------- Join Game Handler -------------------
// ============================================================================

async function handleJoinMinigame(interaction) {
  const sessionId = interaction.options.getString('session_id');
  const userId = interaction.user.id;
  const username = interaction.user.username;
  
  if (!sessionId) {
    return interaction.editReply({
      content: '❌ Please provide a session ID to join a specific game.'
    });
  }
  
  // Find the specific session
  const session = await Minigame.findOne({
    sessionId: sessionId,
    gameType: 'theycame',
    status: { $in: ['waiting', 'active'] }
  });
  
  if (!session) {
    return interaction.editReply({
      content: '❌ Game session not found, expired, or already finished.'
    });
  }
  
  // Check if player already joined
  const alreadyJoined = session.players.find(p => p.discordId === userId);
  if (alreadyJoined) {
    return interaction.editReply({
      content: '✅ You\'re already in the game!'
    });
  }
  
  // Add player to game
  session.players.push({
    discordId: userId,
    username: username,
    joinedAt: new Date()
  });
  
  await session.save();
  
  return interaction.editReply({
    content: `🎮 **${username}** joined the alien defense!`
  });
}

// ============================================================================
// ------------------- Roll Defense Handler -------------------
// ============================================================================

async function handleRollMinigame(interaction, target) {
  const sessionId = interaction.options.getString('session_id');
  
  if (!sessionId) {
    return interaction.editReply({
      content: '❌ Please provide a session ID to participate in a specific game.'
    });
  }
  
  if (!target) {
    return interaction.editReply({
      content: '❌ Please specify target alien (e.g., A1).'
    });
  }
  
  // Generate random roll (1-6)
  const roll = Math.floor(Math.random() * 6) + 1;
  
  const userId = interaction.user.id;
  const username = interaction.user.username;
  
  // Find the specific session
  const session = await Minigame.findOne({
    sessionId: sessionId,
    gameType: 'theycame',
    status: { $in: ['waiting', 'active'] }
  });
  
  if (!session) {
    return interaction.editReply({
      content: '❌ Game session not found, expired, or already finished.'
    });
  }
  
  // Check if player is in the game
  const player = session.players.find(p => p.discordId === userId);
  if (!player) {
    return interaction.editReply({
      content: '❌ You need to join the game first! Use `/minigame theycame action:join session_id:' + sessionId + '`'
    });
  }
  
  // Process the roll
  const result = processAlienDefenseRoll(session.gameData, userId, username, target, roll);
  
  if (result.success) {
    // Check if game should end
    const gameEndCheck = checkAlienDefenseGameEnd(session.gameData);
    if (gameEndCheck.gameEnded) {
      session.status = 'finished';
      session.results.finalScore = gameEndCheck.finalScore;
      session.results.completedAt = new Date();
    }
    
    await session.save();
    
    const embedResult = await createMinigameEmbed(session, 'Defense Roll!');
    const replyOptions = {
      content: result.message,
      embeds: [embedResult.embed]
    };
    if (embedResult.attachment) {
      replyOptions.files = [embedResult.attachment];
    }
    return interaction.editReply(replyOptions);
  } else {
    return interaction.editReply({
      content: result.message
    });
  }
}

// ============================================================================
// ------------------- Status Handler -------------------
// ============================================================================

async function handleStatusMinigame(interaction) {
  const sessionId = interaction.options.getString('session_id');
  
  if (!sessionId) {
    return interaction.editReply({
      content: '❌ Please provide a session ID to view a specific game status.'
    });
  }
  
  // Find the specific session
  const session = await Minigame.findOne({
    sessionId: sessionId,
    gameType: 'theycame'
  });
  
  if (!session) {
    return interaction.editReply({
      content: '❌ Game session not found.'
    });
  }
  
  const embedResult = await createMinigameEmbed(session, 'Game Status');
  const replyOptions = { embeds: [embedResult.embed] };
  if (embedResult.attachment) {
    replyOptions.files = [embedResult.attachment];
  }
  return interaction.editReply(replyOptions);
}

// ============================================================================
// ------------------- Advance Round Handler -------------------
// ============================================================================

async function handleAdvanceRoundMinigame(interaction) {
  const sessionId = interaction.options.getString('session_id');
  
  if (!sessionId) {
    return interaction.editReply({
      content: '❌ Please provide a session ID to advance a specific game.'
    });
  }
  
  // Find the specific session
  const session = await Minigame.findOne({
    sessionId: sessionId,
    gameType: 'theycame',
    status: { $in: ['waiting', 'active'] }
  });
  
  if (!session) {
    return interaction.editReply({
      content: '❌ Game session not found, expired, or already finished.'
    });
  }
  
  // If this is the first round, spawn initial aliens
  if (session.gameData.currentRound === 0) {
    const playerCount = session.gameData.turnOrder.length || session.players.length;
    const spawnResult = spawnAliens(session.gameData, playerCount, 0); // Pass 0 for first turn
    session.gameData.currentRound = 1;
    session.status = 'active';
  }
  
  // Advance the round
  const result = advanceAlienDefenseRound(session.gameData);
  
  if (result.success) {
    // Check if game should end
    const gameEndCheck = checkAlienDefenseGameEnd(session.gameData);
    if (gameEndCheck.gameEnded) {
      session.status = 'finished';
      session.results.finalScore = gameEndCheck.finalScore;
      session.results.completedAt = new Date();
    }
    
    await session.save();
    
    const embedResult = await createMinigameEmbed(session, 'Round Advanced!');
    const replyOptions = {
      content: result.message,
      embeds: [embedResult.embed]
    };
    if (embedResult.attachment) {
      replyOptions.files = [embedResult.attachment];
    }
    return interaction.editReply(replyOptions);
  } else {
    return interaction.editReply({
      content: result.message
    });
  }
}

// ============================================================================
// ------------------- End Game Handler -------------------
// ============================================================================

async function handleEndMinigame(interaction) {
  const sessionId = interaction.options.getString('session_id');
  
  if (!sessionId) {
    return interaction.editReply({
      content: '❌ Please provide a session ID to end a specific game.'
    });
  }
  
  // Find the specific session
  const session = await Minigame.findOne({
    sessionId: sessionId,
    gameType: 'theycame',
    status: { $in: ['waiting', 'active'] }
  });
  
  if (!session) {
    return interaction.editReply({
      content: '❌ Game session not found, expired, or already finished.'
    });
  }
  
  // End the game
  session.status = 'finished';
  session.results.finalScore = session.gameData.villageAnimals;
  session.results.completedAt = new Date();
  
  await session.save();
  
  // Delete the finished session immediately after saving
  await Minigame.deleteOne({ _id: session._id });
  console.log(`[MOD] Finished minigame session ${session.sessionId} deleted from database`);
  
  const embedResult = await createMinigameEmbed(session, 'Game Ended!');
  const replyOptions = {
    content: `🏁 **Game ended by ${interaction.user.username}!** Final score: ${session.gameData.villageAnimals} animals saved!`,
    embeds: [embedResult.embed]
  };
  if (embedResult.attachment) {
    replyOptions.files = [embedResult.attachment];
  }
  return interaction.editReply(replyOptions);
}

// ============================================================================
// ------------------- Embed and Button Creation -------------------
// ============================================================================

async function createMinigameEmbed(session, title) {
  const gameConfig = GAME_CONFIGS.theycame;
  const status = getAlienDefenseGameStatus(session.gameData);
  
  // Generate overlay image with aliens
  let overlayImage = null;
  try {
    overlayImage = await generateAlienOverlayImage(session.gameData, session.sessionId);
  } catch (error) {
    console.error('[mod.js]: Error generating overlay image:', error);
    overlayImage = null;
  }
  
  // Ensure we have valid data
  const gameTitle = gameConfig?.name || 'They Came for the Cows';
  const gameDescription = gameConfig?.description || 'Defend your village from alien invaders! Work together to protect the livestock.';
  const gameStatus = session?.status || 'waiting';
  
  const embed = new EmbedBuilder()
    .setTitle(`👽 ${gameTitle} - ${title}`)
    .setDescription(gameDescription)
    .setColor(getGameStatusColor(gameStatus))
    .setTimestamp();
  
  // Add the overlay image if available, otherwise fallback to village image
  if (overlayImage) {
    embed.setImage(`attachment://minigame-${session.sessionId}-overlay.png`);
  } else {
    const villageImage = session.gameData?.images?.village || getCurrentVillageImage();
    embed.setImage(villageImage);
  }
  
  // Game status - better organized
  const gameStatusText = session.status === 'waiting' ? '⏳ Waiting for players' : 
                        session.status === 'active' ? '⚔️ In Progress' : '🏁 Finished';
  
  const villageDisplayName = session.village ? session.village.charAt(0).toUpperCase() + session.village.slice(1) : 'Unknown';
  const villageEmoji = session.village ? getVillageEmojiByName(session.village) || '' : '';
  
  embed.addFields(
    { 
      name: '📊 Game Status',
      value: `**Session:** ${session.sessionId}\n**Village:** ${villageEmoji} ${villageDisplayName}\n**Progress:** ${status.gameProgress}\n**Status:** ${gameStatusText}\n**Players:** ${session.players.length}/6`, 
      inline: false 
    },
    { 
      name: '🐄 Village Status', 
      value: `**${status.villageAnimals}/25** animals saved\n${status.animalsLost} lost • ${status.defeatedAliens} aliens defeated`, 
      inline: false 
    }
  );
  
  // Turn order info - only show if there are players
  if (session.gameData.turnOrder && session.gameData.turnOrder.length > 0) {
    const turnOrderText = session.gameData.turnOrder.map((player, index) => 
      `${index === session.gameData.currentTurnIndex ? '➤' : '•'} **${player.username}**${index === session.gameData.currentTurnIndex ? ' *(Current Turn)*' : ''}`
    ).join('\n');
    embed.addFields(
      { name: '🔄 Turn Order', value: turnOrderText, inline: false }
    );
  }
  
  // Alien threat with positions
  const alienPositions = getAlienPositions(session.gameData);
  let alienThreatText = '';
  
  if (alienPositions.length > 0) {
    // Group aliens by ring
    const aliensByRing = {
      outer: alienPositions.filter(alien => alien.ring === 1).map(alien => alien.id),
      middle: alienPositions.filter(alien => alien.ring === 2).map(alien => alien.id),
      inner: alienPositions.filter(alien => alien.ring === 3).map(alien => alien.id)
    };
    
    const positionText = [];
    if (aliensByRing.outer.length > 0) {
      positionText.push(`**Outer Ring:** (${aliensByRing.outer.length}) ${aliensByRing.outer.join(', ')}`);
    }
    if (aliensByRing.middle.length > 0) {
      positionText.push(`**Middle Ring:** (${aliensByRing.middle.length}) ${aliensByRing.middle.join(', ')}`);
    }
    if (aliensByRing.inner.length > 0) {
      positionText.push(`**Inner Ring:** (${aliensByRing.inner.length}) ${aliensByRing.inner.join(', ')}`);
    }
    
    alienThreatText = positionText.join('\n');
  } else {
    alienThreatText = '*No active aliens on the field*';
  }
  
  embed.addFields(
    { 
      name: '👾 Alien Threat', 
      value: alienThreatText, 
      inline: false 
    }
  );
  
  // Game info - more compact
  const sessionInfoText = session.questId ? 
    `**ID:** \`${session.sessionId}\`\n**Quest ID:** \`${session.questId}\`` : 
    `**ID:** \`${session.sessionId}\``;
  
  embed.addFields(
    { 
      name: '🎯 Session Info', 
      value: sessionInfoText, 
      inline: false 
    }
  );
  
  // Add command instructions for active games
  if (session.status === 'active') {
    embed.addFields(
      { 
        name: '🎲 Take Your Turn', 
        value: `Use </minigame theycame-roll:1413815457118556201> to attack aliens!\n**Target format:** \`1A\`, \`2B\`, \`3C\` etc.`, 
        inline: false 
      }
    );
  }
  
  if (session.status === 'finished') {
    embed.addFields(
      { name: '🏁 Game Result', value: `Final Score: ${session.results.finalScore} animals saved!`, inline: false }
    );
  }
  
  // Validate embed has required fields
  try {
    const embedData = embed.toJSON();
    if (!embedData.title || !embedData.description) {
      console.error('[mod.js]: Embed missing required fields:', embedData);
      // Create a minimal valid embed as fallback
      const fallbackEmbed = new EmbedBuilder()
        .setTitle('👽 They Came for the Cows - Game Status')
        .setDescription('Defend your village from alien invaders! Work together to protect the livestock.')
        .setColor(0x00ff00)
        .setTimestamp();
      
      return {
        embed: fallbackEmbed,
        attachment: overlayImage
      };
    }
  } catch (error) {
    console.error('[mod.js]: Error validating embed:', error);
  }
  
  // Return both embed and attachment
  return {
    embed: embed,
    attachment: overlayImage
  };
}

// ============================================================================
// ------------------- Detailed Minigame Embed Creation -------------------
// ============================================================================

async function createDetailedMinigameEmbed(session, title, character = null) {
  const gameConfig = GAME_CONFIGS.theycame;
  const status = getAlienDefenseGameStatus(session.gameData);
  
  // Create player list with character names
  const playerList = session.players.length > 0 
    ? session.players.map(p => `• **${p.characterName}**`).join('\n')
    : '*No defenders joined yet*';
  
  // Generate overlay image with aliens
  const overlayImage = await generateAlienOverlayImage(session.gameData, session.sessionId);
  
  const embed = new EmbedBuilder()
    .setTitle(`👽 ${gameConfig.name} - ${title}`)
    .setDescription('*Defend your village from alien invaders! Work together to protect the livestock.*')
    .setColor(getGameStatusColor(session.status))
    .setTimestamp()
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
  
  // Add character thumbnail if provided
  if (character && character.icon) {
    embed.setThumbnail(character.icon);
  }
  
  // Add the overlay image if available, otherwise fallback to village image
  if (overlayImage) {
    embed.setImage(`attachment://minigame-${session.sessionId}-overlay.png`);
  } else {
    const villageImage = session.gameData?.images?.village || getCurrentVillageImage();
    embed.setImage(villageImage);
  }
  
  // Game progress and status
  const gameStatusText = session.status === 'waiting' ? '⏳ Waiting for players' : 
                        session.status === 'active' ? '⚔️ In Progress' : '🏁 Finished';
  
  const villageDisplayName = session.village ? session.village.charAt(0).toUpperCase() + session.village.slice(1) : 'Unknown';
  const villageEmoji = session.village ? getVillageEmojiByName(session.village) || '' : '';
  
  embed.addFields(
    { 
      name: '__📊 Game Status__', 
      value: `**Session:** ${session.sessionId}\n**Village:** ${villageEmoji} ${villageDisplayName}\n**${status.gameProgress}** • ${gameStatusText}`, 
      inline: false 
    },
    { 
      name: '__🐄 Village Status__', 
      value: `**${status.villageAnimals}/25** animals saved\n${status.animalsLost} lost • ${status.defeatedAliens} aliens defeated`, 
      inline: true 
    }
  );
  
  // Combined defenders and turn order info - only show if there are players
  if (session.gameData.turnOrder && session.gameData.turnOrder.length > 0) {
    const turnOrderText = session.gameData.turnOrder.map((player, index) => 
      `${index === session.gameData.currentTurnIndex ? '➤' : '•'} **${player.username}**${index === session.gameData.currentTurnIndex ? ' *(Current Turn)*' : ''}`
    ).join('\n');
    // Add next turn message for active games
    let turnOrderValue = turnOrderText;
    if (session.status === 'active') {
      turnOrderValue += `\n\n**🎯 Next Turn!** Use </minigame theycame-roll:1413815457118556201> to go!`;
    }
    
    embed.addFields(
      { 
        name: '__👥 Defenders & Turn Order__', 
        value: `**${session.players.length} player${session.players.length !== 1 ? 's' : ''}**\n${turnOrderValue}`, 
        inline: false 
      }
    );
  }
  
  // Alien threat with positions
  const alienPositions = getAlienPositions(session.gameData);
  let alienThreatText = '';
  
  if (alienPositions.length > 0) {
    // Group aliens by ring
    const aliensByRing = {
      outer: alienPositions.filter(alien => alien.ring === 1).map(alien => alien.id),
      middle: alienPositions.filter(alien => alien.ring === 2).map(alien => alien.id),
      inner: alienPositions.filter(alien => alien.ring === 3).map(alien => alien.id)
    };
    
    const positionText = [];
    if (aliensByRing.outer.length > 0) {
      positionText.push(`**Outer Ring:** (${aliensByRing.outer.length}) ${aliensByRing.outer.join(', ')}`);
    }
    if (aliensByRing.middle.length > 0) {
      positionText.push(`**Middle Ring:** (${aliensByRing.middle.length}) ${aliensByRing.middle.join(', ')}`);
    }
    if (aliensByRing.inner.length > 0) {
      positionText.push(`**Inner Ring:** (${aliensByRing.inner.length}) ${aliensByRing.inner.join(', ')}`);
    }
    
    alienThreatText = positionText.join('\n');
  } else {
    alienThreatText = '*No active aliens on the field*';
  }
  
  embed.addFields(
    { 
      name: '__👾 Alien Threat__', 
      value: alienThreatText, 
      inline: false 
    }
  );
  
  // Game info
  embed.addFields(
    { 
      name: '__🎯 Session Info__', 
      value: `**ID:** \`${session.sessionId}\`\n**Status:** ${gameStatusText}`, 
      inline: true 
    }
  );
  
  if (session.status === 'finished') {
    embed.addFields(
      { name: '🏁 Game Result', value: `**Final Score:** ${session.results.finalScore} animals saved!`, inline: false }
    );
  }
  
  embed.setFooter({ text: '🎮 Use /minigame commands to participate! • Good luck defending your village! 🛡️' });
  
  // Return both embed and attachment
  return {
    embed: embed,
    attachment: overlayImage
  };
}

function createMinigameButtons(sessionId) {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`minigame_signup_${sessionId}`)
        .setLabel('Sign Up')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✋'),
      new ButtonBuilder()
        .setCustomId(`minigame_join_${sessionId}`)
        .setLabel('Join Game')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🎮'),
      new ButtonBuilder()
        .setCustomId(`minigame_status_${sessionId}`)
        .setLabel('View Status')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📊')
    );
  
  return row;
}

function getGameStatusColor(status) {
  switch (status) {
    case 'waiting': return 0x00ff00; // Green
    case 'active': return 0xffff00; // Yellow
    case 'finished': return 0xff0000; // Red
    default: return 0x808080; // Gray
  }
}

// ------------------- Function: handleVillageCheck -------------------
// Checks village locations for all participants in an RP quest
async function handleVillageCheck(interaction) {
  try {
    const questID = interaction.options.getString('questid');
    const Quest = require('../../models/QuestModel');

    // Find the quest
    const quest = await Quest.findOne({ questID });
    if (!quest) {
      return await safeReply(interaction, `❌ Quest with ID \`${questID}\` not found.`);
    }

    // Check if it's an RP quest
    if (quest.questType !== 'RP') {
      return await safeReply(interaction, '❌ This command can only be used with RP quests.');
    }

    // Check if quest has village requirements
    if (!quest.requiredVillage) {
      return await safeReply(interaction, '❌ This RP quest has no village requirements.');
    }

    // Get village tracking stats
    const stats = quest.getVillageTrackingStats();
    
    // Perform village checks
    const villageCheckResult = await quest.checkAllParticipantsVillages();
    const completedVillageCheck = await quest.checkCompletedParticipantsVillages();
    
    // Save quest after checks
    await quest.save();

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(0x4A90E2)
      .setTitle(`🏘️ Village Check Results - ${quest.title}`)
      .setDescription(`**Quest ID:** \`${quest.questID}\`\n**Required Village:** ${quest.requiredVillage}`)
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setTimestamp();

    // Add statistics
    embed.addFields(
      { name: "📊 Participant Statistics", value: `**Total:** ${stats.totalParticipants}\n**Active:** ${stats.activeParticipants}\n**Completed:** ${stats.completedParticipants}\n**Disqualified:** ${stats.disqualifiedParticipants}`, inline: true },
      { name: "🔍 Village Check Results", value: `**Active Participants Checked:** ${villageCheckResult.checked}\n**Active Disqualified:** ${villageCheckResult.disqualified}\n**Completed Participants Checked:** ${completedVillageCheck.checked}\n**Completed Disqualified:** ${completedVillageCheck.disqualified}`, inline: true }
    );

    // Add detailed participant information
    const participants = Array.from(quest.participants.values());
    let participantInfo = "";
    
    for (const participant of participants) {
      const status = participant.progress === 'active' ? '🟢' : 
                    participant.progress === 'completed' ? '✅' : 
                    participant.progress === 'disqualified' ? '🚫' : '⚪';
      
      const lastCheck = participant.lastVillageCheck ? 
        new Date(participant.lastVillageCheck).toLocaleDateString() : 'Never';
      
      participantInfo += `${status} **${participant.characterName}** (${participant.progress}) - Last check: ${lastCheck}\n`;
    }

    if (participantInfo) {
      embed.addFields({
        name: "👥 Participants",
        value: participantInfo.length > 1024 ? participantInfo.substring(0, 1020) + "..." : participantInfo,
        inline: false
      });
    }

    // Add summary
    const totalDisqualified = villageCheckResult.disqualified + completedVillageCheck.disqualified;
    if (totalDisqualified > 0) {
      embed.addFields({
        name: "⚠️ Summary",
        value: `**${totalDisqualified} participants were disqualified** for village violations during this check.`,
        inline: false
      });
    } else {
      embed.addFields({
        name: "✅ Summary",
        value: "All participants are in the correct village.",
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[mod.js]: Error in handleVillageCheck:', error);
    return await safeReply(interaction, '❌ An error occurred while checking village locations. Please try again later.');
  }
}

// ------------------- Function: handleLevel -------------------
// Handles level and XP modifications for users
async function handleLevel(interaction) {
  try {
    const targetUser = interaction.options.getUser('user');
    const action = interaction.options.getString('action');
    const amount = interaction.options.getInteger('amount');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    // Connect to database
    await connectToTinglebot();
    
    // Get or create user
    const user = await User.getOrCreateUser(targetUser.id);
    
    // Initialize leveling if it doesn't exist
    if (!user.leveling) {
      user.leveling = {
        xp: 0,
        level: 1,
        lastMessageTime: null,
        totalMessages: 0,
        xpHistory: []
      };
    }
    
    let oldLevel = user.leveling.level;
    let oldXP = user.leveling.xp;
    let newLevel = user.leveling.level;
    let newXP = user.leveling.xp;
    let leveledUp = false;
    
    switch (action) {
      case 'add_xp':
        const addResult = await user.addXP(amount, 'moderator_gift');
        newLevel = addResult.newLevel;
        leveledUp = addResult.leveledUp;
        newXP = user.leveling.xp;
        break;
        
      case 'set_xp':
        user.leveling.xp = amount;
        newLevel = user.calculateLevel();
        leveledUp = newLevel > user.leveling.level;
        user.leveling.level = newLevel;
        newXP = amount;
        await user.save();
        break;
        
      case 'set_level':
        // Calculate XP required for the target level
        const targetLevel = amount;
        const xpRequired = targetLevel * 100 + (targetLevel - 1) * 50;
        user.leveling.xp = xpRequired;
        user.leveling.level = targetLevel;
        newLevel = targetLevel;
        newXP = xpRequired;
        await user.save();
        break;
        
      case 'reset_level':
        user.leveling.xp = 0;
        user.leveling.level = 1;
        user.leveling.totalMessages = 0;
        user.leveling.xpHistory = [];
        newLevel = 1;
        newXP = 0;
        await user.save();
        break;
        
      default:
        return await interaction.editReply({
          content: '❌ Invalid action specified.',
          flags: [4096]
        });
    }
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('📈 Level Modification Complete')
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        {
          name: '👤 User',
          value: `${targetUser.tag} (${targetUser.id})`,
          inline: true
        },
        {
          name: '🔧 Action',
          value: action.replace('_', ' ').toUpperCase(),
          inline: true
        },
        {
          name: '📊 Amount',
          value: amount.toString(),
          inline: true
        },
        {
          name: '📈 Level Change',
          value: `**${oldLevel}** → **${newLevel}**`,
          inline: true
        },
        {
          name: '⭐ XP Change',
          value: `**${oldXP.toLocaleString()}** → **${newXP.toLocaleString()}**`,
          inline: true
        },
        {
          name: '📝 Reason',
          value: reason,
          inline: false
        }
      )
      .setFooter({
        text: `Modified by ${interaction.user.tag}`,
        icon_url: interaction.user.displayAvatarURL()
      })
      .setTimestamp();
    
    if (leveledUp) {
      embed.addFields({
        name: '🎉 Level Up!',
        value: `${targetUser} has reached **Level ${newLevel}**!`,
        inline: false
      });
    }
    
    await interaction.editReply({
      embeds: [embed],
      flags: [4096] // Ephemeral
    });
    
  } catch (error) {
    await handleInteractionError(error, interaction, {
      source: 'mod.js',
      subcommand: 'level'
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
