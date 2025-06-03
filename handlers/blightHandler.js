// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

// ------------------- Standard Libraries -------------------
// Built-in Node.js modules
const { EmbedBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

// ------------------- Environment Variables -------------------
// Load environment variables from .env file
require('dotenv').config();

// ------------------- Database Services -------------------
// Services for token and inventory management, and character fetching
const {
  fetchCharacterById,
  fetchItemByName,
  getCharacterInventoryCollection,
  getTokenBalance,
  updateTokenBalance,
  dbFunctions
} = require('../database/db');

// ------------------- Database Models -------------------
// Character model representing a user's character document
const Character = require('../models/CharacterModel');
const TempData = require('../models/TempDataModel');
const Pet = require('../models/PetModel');
const Mount = require('../models/MountModel');

// ------------------- Custom Modules -------------------
// Module for retrieving moderator character data
const { getModCharacterByName } = require('../modules/modCharacters');

// ------------------- Utility Functions -------------------
// Global error handler, inventory utils, Google Sheets utils, storage, and unique ID utils
const { handleError } = require('../utils/globalErrorHandler');
const { removeItemInventoryDatabase } = require('../utils/inventoryUtils');
const {
  appendSheetData,
  authorizeSheets,
  extractSpreadsheetId,
  safeAppendDataToSheet,
  deleteInventorySheetData
} = require('../utils/googleSheetsUtils');
const {
  deleteSubmissionFromStorage,
  saveSubmissionToStorage,
  retrieveSubmissionFromStorage,
  saveBlightRequestToStorage,
  retrieveBlightRequestFromStorage,
  deleteBlightRequestFromStorage
} = require('../utils/storage.js');
const { generateUniqueId } = require('../utils/uniqueIdUtils');
const { syncInventory } = require('./syncHandler');
const { checkInventorySync } = require('../utils/characterUtils');
const { sendUserDM } = require('../utils/messageUtils');

// ============================================================================
// ------------------- Database Connection -------------------
// Connects to MongoDB inventories database
// ============================================================================

// ------------------- Function: connectToInventories -------------------
// Connects to the inventories MongoDB database if not already connected.
async function connectToInventories() {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_INVENTORIES_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
    }
    return mongoose.connection;
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'connectToInventories',
      options: {
        readyState: mongoose.connection.readyState,
        uri: process.env.MONGODB_INVENTORIES_URI ? '[REDACTED]' : 'undefined'
      }
    });
    console.error('[blightHandler]: ❌ Error connecting to inventories database:', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Blight Submission Persistence -------------------
// Functions to load and save blight submission data
// ============================================================================

// ------------------- Function: loadBlightSubmissions -------------------
// Loads all saved blight submissions from TempData.
async function loadBlightSubmissions() {
  try {
    const submissions = await TempData.find({ type: 'blight' });
    return submissions.reduce((acc, submission) => {
      acc[submission.key] = submission.data;
      return acc;
    }, {});
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'loadBlightSubmissions',
      options: {
        type: 'blight'
      }
    });
    console.error('[blightHandler]: Error loading blight submissions', error);
    return {};
  }
}

// ------------------- Function: saveBlightSubmissions -------------------
// Overwrites existing blight submissions with the provided data.
async function saveBlightSubmissions(data) {
  try {
    // Delete all existing blight submissions
    await TempData.deleteMany({ type: 'blight' });
    
    // Save new submissions
    const submissions = Object.entries(data).map(([key, value]) => ({
      type: 'blight',
      key,
      data: value,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    }));
    
    if (submissions.length > 0) {
      await TempData.insertMany(submissions);
    }
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'saveBlightSubmissions',
      options: {
        submissionCount: Object.keys(data).length,
        type: 'blight'
      }
    });
    console.error('[blightHandler]: Error saving blight submissions', error);
  }
}

// ============================================================================
// ------------------- Blight Healing Logic -------------------
// Handles healing request flows, healer validation, embed creation, etc.
// ============================================================================

// ------------------- Function: getRandomHealingRequirement -------------------
// Randomly selects a healing requirement for a character.
function getRandomHealingRequirement(healer, characterName) {
  const requirements = healer.getHealingRequirements(characterName);
  const randomIndex = Math.floor(Math.random() * requirements.length);
  return requirements[randomIndex];
}

// ------------------- Function: healBlight -------------------
// Submits a new healing request, checking eligibility and permissions.
async function healBlight(interaction, characterName, healerName) {
  try {
    // Defer reply immediately to prevent timeout
    await interaction.deferReply();

    // Validate character ownership
    const character = await validateCharacterOwnership(interaction, characterName);
    if (!character) {
      await interaction.editReply({
        content: `❌ You can only perform this action for your **own** characters!`,
        ephemeral: true
      });
      return;
    }

    if (!character.blighted) {
      await interaction.editReply({ content: `⚠️ **${characterName}** is not blighted and does not require healing.`, ephemeral: true });
      return;
    }

    if (character.blightPaused) {
      await interaction.editReply({
        content: `⏸️ Blight progression is currently **paused** for **${character.name}**.`,
        ephemeral: true
      });
      return;
    }

    let oldRequestCancelled = false;
    let oldHealerName = null;
    let oldStage = null;
    // Check for existing pending submission
    const existingSubmissions = await TempData.find({
      type: 'blight',
      'data.characterName': characterName,
      'data.status': 'pending',
      expiresAt: { $gt: new Date() }
    });

    if (existingSubmissions.length > 0) {
      const existingSubmission = existingSubmissions[0];
      // Check if the pending healer is still eligible for the current stage
      const pendingHealer = getModCharacterByName(existingSubmission.data.healerName);
      const currentStage = character.blightStage || 1;
      const pendingPermission = validateHealerPermission(pendingHealer, currentStage);
      if (!pendingPermission.canHeal) {
        // Expire/cancel the old request
        await deleteBlightRequestFromStorage(existingSubmission.key);
        oldRequestCancelled = true;
        oldHealerName = pendingHealer.name;
        oldStage = currentStage;
        // Do NOT reply yet; continue to process new request
      } else {
        const timeLeft = Math.ceil((existingSubmission.expiresAt - new Date()) / (1000 * 60 * 60 * 24));
        const pendingMsg = `⚠️ **${characterName}** already has a pending healing request that expires in ${timeLeft} days.\n\n` +
          `Submission ID: \`${existingSubmission.key}\`\n` +
          `Healer: **${existingSubmission.data.healerName}**\n` +
          `Task: ${existingSubmission.data.taskDescription}\n\n`;
        await interaction.editReply({
          content: pendingMsg,
          ephemeral: true
        });
        // DM the user as well
        try {
          await interaction.user.send({
            content: `Hi <@${interaction.user.id}>, you already have a pending blight healing request for **${characterName}**. Here are the details:\n\n${pendingMsg}`
          });
          console.log(`[blightHandler.js]: 📬 Sent DM to user ${interaction.user.id} about pending blight healing request.`);
        } catch (dmError) {
          handleError(dmError, 'blightHandler.js');
          console.error(`[blightHandler.js]: ❌ Failed to send DM to user ${interaction.user.id} about pending blight healing request: ${dmError.message}`);
        }
        return;
      }
    }

    const healer = getModCharacterByName(healerName);
    if (!healer) {
      await interaction.editReply({ content: `❌ Healer "${healerName}" not found.`, ephemeral: true });
      return;
    }

    if (character.currentVillage.toLowerCase() !== healer.village.toLowerCase()) {
      await interaction.editReply({
        content: `⚠️ **${healer.name}** cannot heal **${characterName}** because they are from different villages.`,
        ephemeral: true,
      });
      return;
    }

    const blightStage = character.blightStage || 1;
    const permissionCheck = validateHealerPermission(healer, blightStage);

    if (!permissionCheck.canHeal) {
      const allowedHealers = permissionCheck.allowedCategories
        .map(category => category.toLowerCase())
        .join(' or ');
      
      await interaction.editReply({
        content: `⚠️ **${healer.name}** cannot heal **${characterName}** at Blight Stage ${blightStage}. Only ${allowedHealers} can heal this stage.`,
        ephemeral: true,
      });
      return;
    }

    const healingRequirement = getRandomHealingRequirement(healer, characterName);
    const newSubmissionId = generateUniqueId('B');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days expiration

    const submissionData = {
      submissionId: newSubmissionId,
      userId: interaction.user.id,
      characterName,
      healerName,
      taskType: healingRequirement.type,
      taskDescription: healingRequirement.description,
      healingStage: blightStage,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    await saveBlightRequestToStorage(newSubmissionId, submissionData);

    // Notify mods in the mod queue channel
    const modQueueChannelId = process.env.MOD_QUEUE_CHANNEL_ID;
    if (modQueueChannelId) {
      const modQueueChannel = interaction.client.channels.cache.get(modQueueChannelId);
      if (modQueueChannel) {
        const modEmbed = new EmbedBuilder()
          .setColor('#AA926A')
          .setTitle('🆕 New Blight Healing Request')
          .setDescription(`A new blight healing request has been submitted.`)
          .addFields(
            { name: 'Character', value: characterName },
            { name: 'User', value: `<@${interaction.user.id}>` },
            { name: 'Healer', value: healerName },
            { name: 'Stage', value: `Stage ${blightStage}` },
            { name: 'Task Type', value: healingRequirement.type },
            { name: 'Task Description', value: healingRequirement.description },
            { name: 'Submission ID', value: `\`${newSubmissionId}\`` },
            { name: 'Expires', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` }
          )
          .setTimestamp();

        await modQueueChannel.send({ embeds: [modEmbed] });
      }
    }

    const embed = createBlightHealingEmbed(character, healer, healingRequirement, newSubmissionId, expiresAt);

    // Reply in-channel using editReply since we deferred
    let replyContent = `<@${interaction.user.id}>`;
    if (oldRequestCancelled) {
      replyContent = `⚠️ **${characterName}** had a pending healing request from **${oldHealerName}**, but they can no longer heal at Stage ${oldStage}.\n\nThe old request has been cancelled. Here is your new healing prompt:\n\n` + replyContent;
    }
    await interaction.editReply({
      content: replyContent,
      embeds: [embed],
      ephemeral: false,
    });

    // Attempt DM
    try {
      await interaction.user.send({
        content: `Hi <@${interaction.user.id}>, here are the details of your healing request:`,
        embeds: [embed],
      });
    } catch (dmError) {
      handleError(dmError, 'blightHandler.js');
      console.error(`[blightHandler]: Failed to send DM to user ${interaction.user.id}`, dmError);
    }
  } catch (error) {
    handleError(error, 'blightHandler.js');
    console.error('[blightHandler]: Error healing blight:', error);
    
    // Since we deferred, we should always use editReply
    await interaction.editReply({ 
      content: '❌ An error occurred while processing your request. Please try again or contact support if the issue persists.', 
      ephemeral: true 
    });
  }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// Utility methods used throughout blight logic
// ============================================================================

// ------------------- Function: validateCharacterOwnership -------------------
// Ensures a character belongs to the user making the interaction.
async function validateCharacterOwnership(interaction, characterName) {
  const userId = interaction.user.id;
  const character = await Character.findOne({ name: characterName, userId });
  if (!character) {
    // Check if the character exists at all (for better error message)
    const exists = await Character.findOne({ name: characterName });
    if (!exists) {
      await interaction.editReply({
        content: `❌ Character "${characterName}" does not exist. Please check the spelling and try again.`,
        ephemeral: true
      });
    } else {
      await interaction.editReply({
        content: `❌ You can only perform this action for your **own** characters!`,
        ephemeral: true
      });
    }
    return null;
  }
  return character;
}

// ------------------- Function: validateHealerPermission -------------------
// Checks if a healer is allowed to heal based on blight stage.
function validateHealerPermission(healer, blightStage) {
  // Define healing permissions by stage
  const stagePermissions = {
    1: ['Sage', 'Oracle', 'Dragon'],
    2: ['Sage', 'Oracle', 'Dragon'],
    3: ['Oracle', 'Dragon'],
    4: ['Dragon'],
    5: ['Dragon'] // Stage 5: Only Dragons can heal
  };

  // Get allowed healer categories for the current stage
  const allowedCategories = stagePermissions[blightStage] || [];
  
  // Check if healer's category is allowed for this stage
  return {
    canHeal: allowedCategories.includes(healer.category),
    allowedCategories,
    stage: blightStage
  };
}

// ------------------- Function: completeBlightHealing -------------------
// Applies healing effects and resets blight status.
async function completeBlightHealing(character) {
  character.blighted = false;
  character.blightedAt = null;
  character.blightStage = 0;
  character.blightEffects = {
    rollMultiplier: 1.0,
    noMonsters: false,
    noGathering: false
  };
  
  await character.save();
}

// ------------------- Function: createBlightHealingFields -------------------
// Creates fields for healing embed (requirement, ID, expiration).
function createBlightHealingFields(healingRequirement, submissionId, expiresAt) {
  // Validate required parameters
  if (!healingRequirement || typeof healingRequirement !== 'object') {
    throw new Error('Invalid healing requirement provided');
  }
  if (!healingRequirement.type || typeof healingRequirement.type !== 'string') {
    throw new Error('Invalid healing requirement type');
  }
  if (!healingRequirement.description || typeof healingRequirement.description !== 'string') {
    throw new Error('Invalid healing requirement description');
  }
  if (!submissionId || typeof submissionId !== 'string') {
    throw new Error('Invalid submission ID');
  }
  
  // Convert expiresAt to Date if it's a string
  const expirationDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  if (!(expirationDate instanceof Date) || isNaN(expirationDate.getTime())) {
    throw new Error('Invalid expiration date');
  }

  let requirementValue;
  if (healingRequirement.type === 'item' && Array.isArray(healingRequirement.items)) {
    // Format item list
    const itemList = healingRequirement.items
      .map(i => `• **${i.name} x${i.quantity}**`)
      .join('\n');
    requirementValue = `> **Type**: 🍎 Item\n> ${healingRequirement.description}\n\n__Accepted Items:__\n${itemList}`;
  } else {
    requirementValue = `> **Type**: ${
      healingRequirement.type === 'art'
        ? '🎨 Art'
        : healingRequirement.type === 'writing'
        ? '✍️ Writing'
        : '🍎 Item'
    }\n> ${healingRequirement.description}`;
  }

  const fields = [
    {
      name: '<:bb0:854499720797618207> __Healing Requirement__',
      value: requirementValue,
    },
    {
      name: '<:bb0:854499720797618207> __Submission ID__',
      value: `\`${submissionId}\``,
    },
    {
      name: '<:bb0:854499720797618207> __Alternative Option__',
      value: `> If you cannot fulfill this request, you can forfeit all of your total tokens to be healed. Use </blight submit:1306176789634355241> to forfeit your tokens.`,
    },
    {
      name: '<:bb0:854499720797618207> __Expiration__',
      value: `> This request will expire in 30 days (<t:${Math.floor(expirationDate.getTime() / 1000)}:R>).\n> ⚠️ You must complete the healing before expiration or your character will remain blighted.`,
    }
  ];

  // Validate field values
  for (const field of fields) {
    if (!field.name || !field.value || typeof field.name !== 'string' || typeof field.value !== 'string') {
      throw new Error('Invalid field format');
    }
  }

  return fields;
}

// ------------------- Function: createBlightHealingEmbed -------------------
// Returns a formatted embed for a new healing request.
function createBlightHealingEmbed(character, healer, healingRequirement, submissionId, expiresAt) {
  return new EmbedBuilder()
    .setColor('#AA926A')
    .setTitle(`${healer.name} from the village of ${healer.village} has heard your request to heal ${character.name}.`)
    .setDescription(healer.roleplayResponseBefore(character.name))
    .setAuthor({ name: character.name, iconURL: character.icon })
    .setThumbnail(healer.iconUrl)
    .addFields(createBlightHealingFields(healingRequirement, submissionId, expiresAt))
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .setFooter({ text: 'Use the Submission ID when you submit the task with /blight submit' })
    .setTimestamp();
}

// ------------------- Function: createBlightHealingCompleteEmbed -------------------
// Returns a formatted embed for a completed healing task.
function createBlightHealingCompleteEmbed(character, healer, additionalFields = []) {
  const embed = new EmbedBuilder()
    .setColor('#AA926A')
    .setTitle(`${character.name} has been healed of their blight by ${healer.name}!`)
    .setDescription(healer.roleplayResponseAfter(character.name))
    .setThumbnail(healer.iconUrl)
    .setAuthor({ name: character.name, iconURL: character.icon })
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .setFooter({ text: 'Healing status successfully updated.' })
    .setTimestamp();

  if (additionalFields.length > 0) {
    embed.addFields(additionalFields);
  }

  return embed;
}

// ============================================================================
// ------------------- Healing Submission Processing -------------------
// Handles submission of healing tasks including item/art/writing/token options.
// ============================================================================

// ------------------- Function: submitHealingTask -------------------
// Processes a healing task submission based on submission ID and type.
async function submitHealingTask(interaction, submissionId, item = null, link = null, tokens = false) {
  // Defer reply at the start to prevent interaction timeout
  await interaction.deferReply({ ephemeral: false });

  try {
    // ------------------- Validate Submission ID -------------------
    if (!submissionId || typeof submissionId !== 'string') {
      await interaction.editReply({ content: '❌ Invalid submission ID provided.', ephemeral: true });
      return;
    }

    // ------------------- Fetch & Validate Submission -------------------
    const submission = await retrieveBlightRequestFromStorage(submissionId);
    if (!submission) {
      await interaction.editReply({ content: `❌ Submission with ID "${submissionId}" not found.` });
      return;
    }

    if (submission.status !== 'pending') {
      await interaction.editReply({
        content: `❌ This submission has already been processed. Status: ${submission.status}`
      });
      return;
    }

    if (new Date(submission.expiresAt) < new Date()) {
      await interaction.editReply({
        content: `❌ This submission has expired. Please request a new healing task.`
      });
      return;
    }

    // ------------------- Fetch Character & Healer -------------------
    const character = await Character.findOne({ name: submission.characterName });
    if (!character) {
      await interaction.editReply({ content: `❌ Character "${submission.characterName}" not found.` });
      return;
    }

    // ---- NEW: Only allow the owner to submit healing for their character ----
    if (interaction.user.id !== character.userId) {
      await interaction.editReply({ content: '❌ You can only submit healing for your own characters.', ephemeral: true });
      return;
    }

    if (typeof character.blightStage !== 'number' || character.blightStage < 0) {
      character.blightStage = 1;
      await character.save();
    }

    const healer = getModCharacterByName(submission.healerName);
    if (!healer) {
      await interaction.editReply({ content: `❌ Healer "${submission.healerName}" not found.` });
      return;
    }

    // ---- NEW: Check healer eligibility for current stage ----
    const permissionCheck = validateHealerPermission(healer, character.blightStage);
    if (!permissionCheck.canHeal) {
      const allowedHealers = permissionCheck.allowedCategories.map(c => c.toLowerCase()).join(' or ');
      await interaction.editReply({
        content: `❌ **${healer.name}** cannot heal **${character.name}** at Blight Stage ${character.blightStage}. Only ${allowedHealers} can heal this stage. Please request a new healing task from an eligible healer.`,
        ephemeral: true
      });
      return;
    }
    // ---- END NEW ----

    // ------------------- Force Inventory Sync Before Healing -------------------
    try {
      await checkInventorySync(character);
    } catch (error) {
      await interaction.editReply({ content: error.message, ephemeral: true });
      return;
    }

    // ========================================================================
    // ------------------- Submission Type: Token Forfeit -------------------
    // ========================================================================
    if (tokens) {
      const userId = interaction.user.id;
      const userData = await getTokenBalance(userId);
      const currentTokenBalance = userData.tokens;
      const tokenTrackerLink = userData.tokenTracker;

      if (currentTokenBalance <= 0) {
        await interaction.editReply({
          content: '❌ You do not have enough tokens to forfeit. You must have more than 0 tokens to use this option.',
          ephemeral: true
        });
        return;
      }

      // Log token forfeiture
      try {
        const spreadsheetId = extractSpreadsheetId(tokenTrackerLink);
        const auth = await authorizeSheets();
        const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
        const tokenRow = [[
          'Blight Healing',
          interactionUrl,
          'blight healing',
          'spent',
          `-${currentTokenBalance}`
        ]];
        await safeAppendDataToSheet(tokenTrackerLink, character, 'loggedTracker!B7:F', tokenRow, undefined, { skipValidation: true });
      } catch (sheetError) {
        handleError(sheetError, 'blightHandler.js');
        console.error('[blightHandler]: Error logging token forfeiture', sheetError);
      }

      await updateTokenBalance(userId, -currentTokenBalance);

      submission.status = 'completed';
      submission.submittedAt = new Date().toISOString();
      submission.forfeitTokens = true;

      await deleteBlightRequestFromStorage(submissionId);
      await completeBlightHealing(character);

      const embed = createBlightHealingCompleteEmbed(character, healer, [
        {
          name: 'Token Forfeiture',
          value: `You have forfeited **${currentTokenBalance} tokens** in exchange for healing **${character.name}**.`
        }
      ]);

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ========================================================================
    // ------------------- Submission Type: Item -------------------
    // ========================================================================
    if (submission.taskType === 'item') {
      // ---- NEW: Robust item parsing and error messaging ----
      if (!item || typeof item !== 'string' || !item.trim()) {
        await interaction.editReply({
          content: `❌ You must provide an item in the format: Item Name xQuantity (e.g., Bright-Eyed Crab x4).`,
          ephemeral: true
        });
        return;
      }
      const itemMatch = item.match(/^(.*) x(\d+)$/i);
      if (!itemMatch) {
        await interaction.editReply({
          content: `❌ Invalid item format. Please use: Item Name xQuantity (e.g., Bright-Eyed Crab x4).`,
          ephemeral: true
        });
        return;
      }
      const itemName = itemMatch[1].trim();
      const itemQuantityInt = parseInt(itemMatch[2], 10);
      if (!itemName || isNaN(itemQuantityInt) || itemQuantityInt <= 0) {
        await interaction.editReply({
          content: `❌ Invalid item or quantity. Please use: Item Name xQuantity (e.g., Bright-Eyed Crab x4).`,
          ephemeral: true
        });
        return;
      }
      // ---- END NEW ----

      const healingItems = healer.getHealingRequirements(submission.characterName)
        .find((req) => req.type === 'item').items;

      // ---- NEW: Case-insensitive item matching ----
      const requiredItem = healingItems.find((i) =>
        i.name.toLowerCase() === itemName.toLowerCase() && i.quantity === itemQuantityInt
      );
      // ---- END NEW ----

      if (!requiredItem) {
        await interaction.editReply({
          content: `❌ **${itemName} x${itemQuantityInt}** is not a valid requirement from **${healer.name}**.`,
          ephemeral: true
        });
        return;
      }

      // ------------------- Inventory Validation -------------------
      const hasItem = async (characterId, name, needed) => {
        try {
          const char = await fetchCharacterById(characterId);
          const collection = await getCharacterInventoryCollection(char.name);
          const inventoryItems = await collection.find({}).toArray();
          const totalQuantity = inventoryItems
            .filter((it) => it.itemName.toLowerCase() === name.toLowerCase())
            .reduce((sum, it) => sum + it.quantity, 0);
          return { available: totalQuantity >= needed, quantity: totalQuantity };
        } catch (invError) {
          handleError(invError, 'blightHandler.js');
          console.error('[blightHandler]: Error fetching inventory', invError);
          throw invError;
        }
      };

      const validationResult = await hasItem(character._id, requiredItem.name, requiredItem.quantity);
      if (!validationResult.available) {
        await interaction.editReply({
          content: `❌ **${character.name}** only has **${validationResult.quantity}** of **${requiredItem.name}**, but **${requiredItem.quantity}** is needed.`,
          ephemeral: true
        });
        return;
      }

      const removed = await removeItemInventoryDatabase(character._id, itemName, itemQuantityInt, interaction);
      if (!removed) {
        throw new Error(`Failed to remove ${itemName} x${itemQuantityInt} from inventory.`);
      }

      // Log inventory change
      try {
        const inventoryLink = character.inventory || character.inventoryLink;
        if (inventoryLink) {
          const spreadsheetId = extractSpreadsheetId(inventoryLink);
          const auth = await authorizeSheets();
          const uniqueSyncId = uuidv4();
          const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
          const values = [[
            character.name,
            itemName,
            `-${itemQuantityInt}`,
            'Healing',
            submission.taskType,
            '',
            'Blight Healing',
            character.job,
            '',
            character.currentVillage,
            `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${(await interaction.fetchReply()).id}`,
            formattedDateTime,
            uniqueSyncId
          ]];
          await safeAppendDataToSheet(character.inventory, character, 'loggedInventory!A2:M', values, undefined, { skipValidation: true });
        }
      } catch (invSheetError) {
        handleError(invSheetError, 'blightHandler.js');
        console.error('[blightHandler]: Error appending to Google Sheets', invSheetError);
      }

      await deleteBlightRequestFromStorage(submissionId);
      await completeBlightHealing(character);

      const embed = createBlightHealingCompleteEmbed(character, healer, [
        {
          name: 'Submitted Item',
          value: `${requiredItem.emoji || ''} **Item**: ${itemName} x${itemQuantityInt}`
        },
        {
          name: 'Inventory Link',
          value: `[View Inventory](${character.inventory})`
        }
      ]);

      await interaction.editReply({ embeds: [embed], ephemeral: false });
      return;
    }

    // ========================================================================
    // ------------------- Submission Type: Art or Writing -------------------
    // ========================================================================
    if (['art', 'writing'].includes(submission.taskType)) {
      if (!link) {
        await interaction.editReply({ content: '❌ You must provide a link to your submission for healing.' });
        return;
      }

      // Validate Discord message link
      const linkValidation = validateDiscordMessageLink(link);
      if (!linkValidation.valid) {
        await interaction.editReply({ 
          content: `❌ ${linkValidation.error}\n\nPlease submit your art/writing in the submissions channel and use the link from there.`,
          ephemeral: true 
        });
        return;
      }

      submission.status = 'completed';
      submission.submittedAt = new Date().toISOString();
      await deleteBlightRequestFromStorage(submissionId);
      await completeBlightHealing(character);

      const embed = createBlightHealingCompleteEmbed(character, healer, [
        {
          name: 'Submitted Link',
          value: `[View Submission](${link})`
        }
      ]);

      await interaction.editReply({ embeds: [embed], ephemeral: false });
      return;
    }

  } catch (error) {
    handleError(error, 'blightHandler.js');
    console.error('[blightHandler]: Error submitting healing task:', error);
    await interaction.editReply({ content: '❌ An error occurred while processing your request.', ephemeral: true });
  }
}

// ------------------- Function: validateDiscordMessageLink -------------------
// Validates if a link is a valid Discord message link and belongs to the correct channel
function validateDiscordMessageLink(link) {
  try {
    // Discord message link format: https://discord.com/channels/guildId/channelId/messageId
    const discordLinkRegex = /^https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)$/;
    const match = link.match(discordLinkRegex);
    
    if (!match) {
      return {
        valid: false,
        error: 'Invalid Discord message link format. Please provide a valid Discord message link.'
      };
    }

    const [, guildId, channelId, messageId] = match;
    
    // Check if the link is from the submissions channel
    const submissionsChannelId = process.env.SUBMISSIONS_CHANNEL_ID;
    if (submissionsChannelId && channelId !== submissionsChannelId) {
      return {
        valid: false,
        error: 'The submission link must be from the submissions channel.'
      };
    }

    return {
      valid: true,
      guildId,
      channelId,
      messageId
    };
  } catch (error) {
    return {
      valid: false,
      error: 'Error validating Discord message link.'
    };
  }
}

// ============================================================================
// ------------------- Blight Progression -------------------
// Handles rolling for progression, reminders, auto-progress, etc.
// ============================================================================

// ------------------- Function: rollForBlightProgression -------------------
// Rolls to advance or maintain a character's blight stage once per daily window.
async function rollForBlightProgression(interaction, characterName) {
  try {
    // Defer reply immediately to prevent timeout
    await interaction.deferReply();

    // ------------------- Input Validation -------------------
    if (!characterName || typeof characterName !== 'string') {
      await interaction.editReply({ content: '❌ Invalid character name provided.', ephemeral: true });
      return;
    }

    const character = await Character.findOne({ name: characterName });
    if (!character) {
      await interaction.editReply({ content: `❌ Character "${characterName}" not found.`, ephemeral: true });
      return;
    }

    if (!character.blighted) {
      await interaction.editReply({
        content: `**WOAH! ${characterName} is not blighted! You don't need to roll for them!** 🌟`,
        ephemeral: true,
      });
      return;
    }

    // Prevent stage 5 characters from rolling
    if (character.blightStage === 5) {
      await interaction.editReply({
        content: `⚠️ **${characterName}** is at Stage 5 Blight and cannot roll anymore.\n\n` +
          `You have until <t:${Math.floor(character.deathDeadline.getTime() / 1000)}:F> to be healed by a Dragon or your character will die.`,
        ephemeral: true,
      });
      return;
    }

    // ------------------- Blight Call Timing Logic -------------------
    const now = new Date();
    const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const currentCallStart = new Date(estNow);
    currentCallStart.setDate(estNow.getDate() - (estNow.getHours() < 21 ? 1 : 0));
    currentCallStart.setHours(21, 17, 0, 0);
    const nextCallStart = new Date(currentCallStart);
    nextCallStart.setDate(currentCallStart.getDate() + 1);

    const lastRollDate = character.lastRollDate || new Date(0);
    const lastRollDateEST = new Date(lastRollDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));

    // Check if the last roll was within the current window
    if (lastRollDateEST >= currentCallStart && lastRollDateEST < nextCallStart) {
      const timeUntilNextRoll = nextCallStart - estNow;
      const hoursUntilNextRoll = Math.floor(timeUntilNextRoll / (1000 * 60 * 60));
      const minutesUntilNextRoll = Math.floor((timeUntilNextRoll % (1000 * 60 * 60)) / (1000 * 60));

      await interaction.reply({
        content: `**${characterName}** has already rolled during the current Blight Call window.\n\n` +
          `You can roll again after **9:17 PM EST** (in ${hoursUntilNextRoll} hours and ${minutesUntilNextRoll} minutes).`,
        ephemeral: true,
      });
      return;
    }

    // ------------------- Roll & Stage Determination -------------------
    character.lastRollDate = estNow;
    const roll = Math.floor(Math.random() * 1000) + 1;
    let stage;
    let embedTitle;
    let embedDescription;
    const blightEmoji = '<:blight_eye:805576955725611058>';
    const previousStage = character.blightStage || 1;

    if (roll <= 25) {
      stage = 2;
      embedTitle = `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 2 ${blightEmoji}`;
      embedDescription = `⚠️ Infected areas spread inside and out, and the blight begins traveling toward vital organs. Fatigue fades but nausea typically persists.\n\nInfected now experience an **increase in physical strength**.\n\n🎯 **Stage 2 Effect**: Your rolls are now multiplied by 1.5x.\n\nYou can still be healed by **sages, oracles, or dragons**.`
    } else if (roll <= 40) {
      stage = 3;
      embedTitle = `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 3 ${blightEmoji}`;
      embedDescription = `⚠️ Visible infected areas and feverish symptoms fade. You experience **frequent nosebleeds** and **malice-like sputum**, which can now **infect others**.\n\nHallucinations, **further strength increases**, and **aggressive mood swings** occur.\n\n👻 **Stage 3 Effect**: Monsters no longer attack you.\n\nAt this stage, healing is only possible by **oracles or dragons**.`
    } else if (roll <= 67) {
      stage = 4;
      embedTitle = `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 4 ${blightEmoji}`;
      embedDescription = `⚠️ All outward signs of infection vanish—**except your eyes**, which now resemble those of Malice.\n\nVital organs begin to **fail**, and the infected is driven by an **uncontrollable desire to destroy**.\n\nAny contact with bodily fluids poses a **severe infection risk to others**.\n\n💀 **Stage 4 Effect**: No monsters. No gathering.\n\nYou can only be healed by **dragons** at this stage.`
    } else if (roll <= 100) {
      stage = 5;
      // Only set death deadline if they weren't already at stage 5
      if (previousStage < 5) {
        character.deathDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      }
      await character.save();
      embedTitle = `☠ Your Blight Sickness IS ON THE EDGE of STAGE 5 ☠`;
      embedDescription = `⚠️ You are dangerously close to death.\n\nYou have **7 days** to complete your **healing prompt** or find **miraculous intervention**. Stage 5 is irreversible.\n\n💀 **Stage 5 Effect**: No monsters. No gathering. No healing except by Dragons.\n\nThis is your **final warning**.`
    } else {
      // Failed roll: always advance stage by 1, unless already at 5
      if (previousStage < 5) {
        stage = previousStage + 1;
      } else {
        stage = 5;
      }
      switch (stage) {
        case 2:
          embedTitle = `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 2 ${blightEmoji}`;
          embedDescription = `⚠️ Infected areas spread inside and out, and the blight begins traveling toward vital organs. Fatigue fades but nausea typically persists.\n\nInfected now experience an **increase in physical strength**.\n\n🎯 **Stage 2 Effect**: Your rolls are now multiplied by 1.5x.\n\nYou can still be healed by **sages, oracles, or dragons**.`;
          break;
        case 3:
          embedTitle = `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 3 ${blightEmoji}`;
          embedDescription = `⚠️ Visible infected areas and feverish symptoms fade. You experience **frequent nosebleeds** and **malice-like sputum**, which can now **infect others**.\n\nHallucinations, **further strength increases**, and **aggressive mood swings** occur.\n\n👻 **Stage 3 Effect**: Monsters no longer attack you.\n\nAt this stage, healing is only possible by **oracles or dragons**.`;
          break;
        case 4:
          embedTitle = `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 4 ${blightEmoji}`;
          embedDescription = `⚠️ All outward signs of infection vanish—**except your eyes**, which now resemble those of Malice.\n\nVital organs begin to **fail**, and the infected is driven by an **uncontrollable desire to destroy**.\n\nAny contact with bodily fluids poses a **severe infection risk to others**.\n\n💀 **Stage 4 Effect**: No monsters. No gathering.\n\nYou can only be healed by **dragons** at this stage.`;
          break;
        case 5:
          // Only set death deadline if they weren't already at stage 5
          if (previousStage < 5) {
            character.deathDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          }
          await character.save();
          embedTitle = `☠ Your Blight Sickness IS ON THE EDGE of STAGE 5 ☠`;
          embedDescription = `⚠️ You are dangerously close to death.\n\nYou have **7 days** to complete your **healing prompt** or find **miraculous intervention**. Stage 5 is irreversible.\n\n💀 **Stage 5 Effect**: No monsters. No gathering. No healing except by Dragons.\n\nThis is your **final warning**.`;
          break;
        default:
          embedTitle = `Unknown Stage`;
          embedDescription = `An unknown error occurred. Please contact support.`;
      }
    }

    // ------------------- Update Character -------------------
    character.blightStage = stage;
    character.blightEffects = {
      rollMultiplier: stage === 2 ? 1.5 : 1.0,
      noMonsters: stage >= 3,
      noGathering: stage >= 4
    };
    await character.save();

    // ------------------- Log Blight Roll History -------------------
    const BlightRollHistory = require('../models/BlightRollHistoryModel');
    await BlightRollHistory.create({
      characterId: character._id,
      characterName: character.name,
      userId: character.userId,
      rollValue: roll,
      previousStage,
      newStage: stage,
      timestamp: new Date(),
      notes: ''
    });

    // ------------------- Embed Construction -------------------
    const embed = new EmbedBuilder()
      .setColor('#AD1457')
      .setTitle(embedTitle)
      .setDescription(embedDescription)
      .setFooter({ text: `🎲 Roll: ${roll}` })
      .setThumbnail(character.icon)
      .setAuthor({ name: `${characterName}'s Blight Progression`, iconURL: interaction.user.displayAvatarURL() })
      .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
      .setTimestamp();

    await interaction.reply({ content: `<@${interaction.user.id}> rolled for ${characterName}`, embeds: [embed] });
  } catch (error) {
    handleError(error, 'blightHandler.js');
    console.error('[blightHandler]: Error rolling for blight progression:', error);
    await interaction.reply({ content: '❌ An error occurred while processing your request.', ephemeral: true });
  }
}

// ------------------- Function: postBlightRollCall -------------------
// Sends daily roll reminder at 9:17 PM EST to the configured channel.
async function postBlightRollCall(client) {
  const channelId = process.env.BLIGHT_NOTIFICATIONS_CHANNEL_ID;
  const roleId = process.env.BLIGHT_REMINDER_ROLE_ID;

  if (!client || !client.channels) {
    console.error('[blightHandler]: Invalid Discord client.');
    return;
  }

  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    console.error('[blightHandler]: Channel not found for posting blight roll call.');
    return;
  }

  const embed = new EmbedBuilder()
    .setColor('#AD1457')
    .setTitle('📢 Daily Blight Roll Call! Please roll to see if your Blight gets any worse!')
    .setDescription(
      `**__INSTRUCTIONS__** ▻\n` +
      `Use this command:  \n` +
      `\`/blight roll character_name\`  \n` + `➸ And you're done until the next time!\n\n` +
      `**~~────────────────────~~**  \n` +
      `▹ [Blight Information](https://www.rootsofthewild.com/blight 'Blight Information')  \n` +
      `▹ [Currently Available Blight Healers](https://discord.com/channels/603960955839447050/651614266046152705/845481974671736842 'Blight Healers')  \n` +
      `**~~────────────────────~~**  \n` +
      `:clock8: Blight calls happen every day around 9:17 PM EST!  \n` +
      `:alarm_clock: You must complete your roll before the next call for it to be counted!  \n` +
      `:warning: Remember, if you miss a roll you __automatically progress to the next stage__.  \n` +
      `▹To request blight healing, please use </blight heal:1306176789634355241>`
    )
    .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
    .setFooter({ text: 'Blight calls happen daily at 9:17 PM EST!' })
    .setTimestamp();

  await channel.send({ content: `<@&${roleId}>` });
  await channel.send({ embeds: [embed] });

  console.log('[blightHandler]: Blight roll call posted successfully.');
}

// ------------------- Function: viewBlightHistory -------------------
// Displays the most recent blight progression history for a character.
async function viewBlightHistory(interaction, characterName, limit = 10) {
  try {
    const character = await Character.findOne({ name: characterName });
    if (!character) {
      await interaction.reply({ content: `❌ Character "${characterName}" not found.`, ephemeral: true });
      return;
    }

    const history = await getCharacterBlightHistory(character._id, limit);
    
    if (history.length === 0) {
      await interaction.reply({
        content: `📜 **${characterName}** has no recorded blight history.`,
        ephemeral: true
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#AA926A')
      .setTitle(`📜 Blight History for ${characterName}`)
      .setDescription(`Showing the last ${history.length} blight progression events.`)
      .setThumbnail(character.icon)
      .setAuthor({ name: characterName, iconURL: character.icon })
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
      .setFooter({ text: 'Blight History' })
      .setTimestamp();

    // Group history entries by date
    const groupedHistory = history.reduce((acc, entry) => {
      const date = new Date(entry.timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(entry);
      return acc;
    }, {});

    // Add fields for each date
    for (const [date, entries] of Object.entries(groupedHistory)) {
      let fieldValue = '';
      for (const entry of entries) {
        const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });
        const stageChange = entry.newStage > entry.previousStage ? '📈' : '📉';
        fieldValue += `${time} - ${stageChange} Stage ${entry.previousStage} → Stage ${entry.newStage} (Roll: ${entry.rollValue})\n`;
        if (entry.notes) {
          fieldValue += `> ${entry.notes}\n`;
        }
      }
      embed.addFields({ name: date, value: fieldValue });
    }

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    handleError(error, 'blightHandler.js');
    console.error('[blightHandler]: Error viewing blight history:', error);
    await interaction.reply({ content: '❌ An error occurred while fetching blight history.', ephemeral: true });
  }
}

// ------------------- Function: cleanupExpiredBlightRequests -------------------
// Deletes all expired TempData entries related to blight.
async function cleanupExpiredBlightRequests() {
  try {
    const result = await TempData.deleteMany({ 
      type: 'blight',
      expiresAt: { $lt: new Date() }
    });
    
    console.log(`[blightHandler]: Cleaned up ${result.deletedCount} expired blight requests`);
    return result.deletedCount;
  } catch (error) {
    handleError(error, 'blightHandler.js');
    console.error('[blightHandler]: Error cleaning up expired blight requests:', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Function: checkMissedRolls -------------------
// Checks if characters missed a roll and auto-advances their blight.
// ============================================================================

async function checkMissedRolls(client) {
  try {
    console.log('[blightHandler]: Starting checkMissedRolls...');
    
    // ------------------- Validate Discord Client -------------------
    if (!client || !client.channels || !client.token) {
      console.error('[blightHandler]: ❌ Invalid Discord client provided to checkMissedRolls');
      return;
    }

    const channelId = process.env.BLIGHT_NOTIFICATIONS_CHANNEL_ID;
    if (!channelId) {
      console.error('[blightHandler]: ❌ BLIGHT_NOTIFICATIONS_CHANNEL_ID not set in environment variables');
      return;
    }

    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      console.error('[blightHandler]: ❌ Channel not found for missed roll notifications:', channelId);
      return;
    }

    // ------------------- Fetch All Blighted Characters -------------------
    const blightedCharacters = await Character.find({ blighted: true });
    console.log(`[blightHandler]: Found ${blightedCharacters.length} blighted characters to check`);

    const blightEmoji = '<:blight_eye:805576955725611058>';
    const stageDescriptions = {
      2: {
        title: `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 2 ${blightEmoji}`,
        desc: `⚠️ Infected areas spread inside and out, and the blight begins traveling toward vital organs. Fatigue fades but nausea typically persists.\n\nInfected now experience an **increase in physical strength**.\n\n🎯 **Stage 2 Effect**: Your rolls are now multiplied by 1.5x.\n\nYou can still be healed by **sages, oracles, or dragons**.`
      },
      3: {
        title: `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 3 ${blightEmoji}`,
        desc: `⚠️ Visible infected areas and feverish symptoms fade. You experience **frequent nosebleeds** and **malice-like sputum**, which can now **infect others**.\n\nHallucinations, **further strength increases**, and **aggressive mood swings** occur.\n\n👻 **Stage 3 Effect**: Monsters no longer attack you.\n\nAt this stage, healing is only possible by **oracles or dragons**.`
      },
      4: {
        title: `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 4 ${blightEmoji}`,
        desc: `⚠️ All outward signs of infection vanish—**except your eyes**, which now resemble those of Malice.\n\nVital organs begin to **fail**, and the infected is driven by an **uncontrollable desire to destroy**.\n\nAny contact with bodily fluids poses a **severe infection risk to others**.\n\n💀 **Stage 4 Effect**: No monsters. No gathering.\n\nYou can only be healed by **dragons** at this stage.`
      },
      5: {
        title: `☠ Your Blight Sickness IS ON THE EDGE of STAGE 5 ☠`,
        desc: `⚠️ You are dangerously close to death.\n\nYou have **7 days** to complete your **healing prompt** or find **miraculous intervention**. Stage 5 is irreversible.\n\n💀 **Stage 5 Effect**: No monsters. No gathering. No healing except by Dragons.\n\nThis is your **final warning**.`
      }
    };

    // Check for expired submissions
    const blightSubmissions = await loadBlightSubmissions();
    const now = new Date();
    console.log(`[blightHandler]: Checking ${Object.keys(blightSubmissions).length} blight submissions for expiration`);
    
    for (const [id, submission] of Object.entries(blightSubmissions)) {
      if (submission.status === 'pending' && submission.timestamp && new Date(submission.timestamp) < now) {
        console.log(`[blightHandler]: Found expired submission for ${submission.characterName}`);
        submission.status = 'expired';
        await saveBlightSubmissions(blightSubmissions);
        
        if (submission.userId) {
          try {
            await sendUserDM(client, submission.userId, `Your blight submission for ${submission.characterName} has expired.`);
            console.log(`[blightHandler]: Sent expiration DM to user ${submission.userId}`);
          } catch (error) {
            console.error('[blightHandler]: ❌ Error sending DM:', error);
          }
        }
      }
    }

    for (const character of blightedCharacters) {
      const lastRollDate = character.lastRollDate || new Date(0);
      const timeSinceLastRoll = Date.now() - lastRollDate.getTime();
      console.log(`[blightHandler]: Checking ${character.name} - Last roll: ${lastRollDate.toISOString()}, Time since: ${Math.floor(timeSinceLastRoll / (1000 * 60 * 60))} hours`);

      // ---- SKIP missed roll progression if newly blighted after last blight call ----
      // Calculate last blight call (9:17 PM EST previous day)
      const nowEST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const lastBlightCall = new Date(nowEST);
      if (nowEST.getHours() < 21 || (nowEST.getHours() === 21 && nowEST.getMinutes() < 17)) {
        lastBlightCall.setDate(nowEST.getDate() - 1);
      }
      lastBlightCall.setHours(21, 17, 0, 0);
      if (character.blightedAt && character.blightedAt > lastBlightCall) {
        console.log(`[blightHandler]: Skipping missed roll for ${character.name} (blightedAt=${character.blightedAt.toISOString()}) - infected after last blight call.`);
        continue;
      }

      // ========================================================================
      // ------------------- STAGE 5: Death Watch -------------------
      // ========================================================================
      if (character.blightStage === 5 && character.deathDeadline) {
        const timeUntilDeath = character.deathDeadline - now;
        const oneDayMs = 24 * 60 * 60 * 1000;
        console.log(`[blightHandler]: ${character.name} is at Stage 5 - Time until death: ${Math.floor(timeUntilDeath / (1000 * 60 * 60))} hours`);

        // ------------------- DM Final Warning -------------------
        if (timeUntilDeath <= oneDayMs && timeUntilDeath > 0) {
          try {
            const user = await client.users.fetch(character.userId);
            if (user) {
              const warningEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⚠️ FINAL WARNING: 24 Hours Until Blight Death ⚠️')
                .setDescription(
                  `**${character.name}** has only **24 hours** remaining before succumbing to Stage 5 Blight.\n\n` +
                  `🕒 **Time Remaining**: <t:${Math.floor(character.deathDeadline.getTime() / 1000)}:R>\n\n` +
                  `⚠️ You must be healed by a **Dragon** before the deadline to avoid death.`
                )
                .setThumbnail(character.icon || 'https://example.com/default-icon.png')
                .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
                .setTimestamp();

              await user.send({ embeds: [warningEmbed] });
              console.log(`[blightHandler]: Sent 24-hour warning DM to ${character.userId} (${character.name})`);
            }
          } catch (error) {
            handleError(error, 'blightHandler.js');
            console.error(`[blightHandler]: Failed to send DM to ${character.userId} (${character.name})`, error);
          }
        }

        // ------------------- Handle Death If Deadline Passed -------------------
        if (now > character.deathDeadline) {
          // Remove active companions first
          if (character.currentActivePet) {
            const pet = await Pet.findById(character.currentActivePet);
            if (pet) {
              pet.status = 'retired';
              await pet.save();
            }
          }
          if (character.currentActiveMount) {
            const mount = await Mount.findById(character.currentActiveMount);
            if (mount) {
              mount.status = 'retired';
              await mount.save();
            }
          }

          // Delete active blight submissions
          try {
            const blightSubmissions = loadBlightSubmissions();
            const pendingSubmissions = Object.keys(blightSubmissions).filter(id =>
              blightSubmissions[id].characterName === character.name &&
              blightSubmissions[id].status === 'pending'
            );

            for (const submissionId of pendingSubmissions) {
              delete blightSubmissions[submissionId];
              deleteSubmissionFromStorage(submissionId);
            }

            saveBlightSubmissions(blightSubmissions);
          } catch (error) {
            handleError(error, 'blightHandler.js');
            console.error('[blightHandler]: Error cleaning up blight submissions:', error);
          }

          // Wipe character's inventory from DB (not sheet)
          try {
            const inventoriesConnection = await connectToInventories();
            const db = inventoriesConnection.useDb("inventories");
            const collectionName = character.name.toLowerCase();
            
            // Drop the entire collection instead of just deleting documents
            await db.collection(collectionName).drop().catch(error => {
              if (error.code !== 26) { // Ignore "namespace not found" error
                throw error;
              }
            });
            
            console.log(`[blightHandler]: Dropped inventory collection for ${character.name}`);
          } catch (error) {
            handleError(error, 'blightHandler.js');
            console.error('[blightHandler]: Error wiping inventory:', error);
          }

          // Store character info for the death announcement before deletion
          const characterInfo = {
            name: character.name,
            userId: character.userId,
            icon: character.icon
          };

          // Delete the character from the database
          await Character.deleteOne({ _id: character._id });

          // ------------------- Death Announcement Embed -------------------
          const embed = new EmbedBuilder()
            .setColor('#D32F2F')
            .setTitle(`<:blight_eye:805576955725611058> **Blight Death Alert** <:blight_eye:805576955725611058>`)
            .setDescription(
              `**${characterInfo.name}** has succumbed to Stage 5 Blight.\n\n` +
              `*Their body has been claimed by the blight, their spirit lost to the void. Their name shall be remembered, but their presence in this world is no more.*`
            )
            .setThumbnail(characterInfo.icon || 'https://example.com/default-icon.png')
            .setFooter({ text: 'Blight Death Announcement', iconURL: 'https://example.com/blight-icon.png' })
            .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
            .setTimestamp();

          if (characterInfo.userId) {
            await channel.send({ content: `<@${characterInfo.userId}>`, embeds: [embed] });
          } else {
            await channel.send({ embeds: [embed] });
            console.error(`[blightHandler]: Missing userId for ${characterInfo.name}`);
          }

          // ------------------- Mod Log Death Report -------------------
          try {
            const modLogChannel = client.channels.cache.get(process.env.MOD_LOG_CHANNEL_ID);
            if (modLogChannel) {
              const modLogEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('☠️ Character Death from Blight')
                .setDescription(`**Character**: ${characterInfo.name}\n**Owner**: <@${characterInfo.userId}>\n**Death Time**: <t:${Math.floor(Date.now() / 1000)}:F>`)
                .setThumbnail(characterInfo.icon || 'https://example.com/default-icon.png')
                .setFooter({ text: 'Blight Death Log', iconURL: 'https://example.com/blight-icon.png' })
                .setTimestamp();

              await modLogChannel.send({ embeds: [modLogEmbed] });
              console.log(`[blightHandler]: Sent death notification for ${characterInfo.name}`);
            } else {
              console.error('[blightHandler]: Mod log channel not found');
            }
          } catch (error) {
            handleError(error, 'blightHandler.js');
            console.error('[blightHandler]: Error sending mod log death report:', error);
          }

          continue;
        }

        // ------------------- Non-death Stage 5 Alert -------------------
        const stage5Embed = new EmbedBuilder()
          .setColor('#AD1457')
          .setTitle(`⚠️ ${character.name} is at Blight Stage 5`)
          .setDescription(
            `❗ **Missed Roll**: Your blight is at the final stage and you are on the edge of death.\n\n` +
            `🕒 **Deadline**: <t:${Math.floor(character.deathDeadline.getTime() / 1000)}:F>\n\n` +
            `⚠️ **You must be healed before the deadline to avoid certain death.**`
          )
          .setThumbnail(character.icon || 'https://example.com/default-icon.png')
          .setFooter({ text: 'Blight Stage 5 Alert' })
          .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
          .setTimestamp();

        await channel.send({ content: `<@${character.userId}>`, embeds: [stage5Embed] });
        continue;
      }

      // ========================================================================
      // ------------------- Missed Roll → Auto Progression -------------------
      // ========================================================================
      const oneDayMs = 24 * 60 * 60 * 1000;
      if (timeSinceLastRoll > oneDayMs && character.blightStage < 5) {
        console.log(`[blightHandler]: ${character.name} missed roll - Progressing from Stage ${character.blightStage}`);
        character.blightStage += 1;

        if (character.blightStage === 5) {
          character.deathDeadline = new Date(Date.now() + 7 * oneDayMs);
          console.log(`[blightHandler]: ${character.name} reached Stage 5 - Death deadline set to ${character.deathDeadline.toISOString()}`);
        }

        // Update blight effects based on new stage
        character.blightEffects = {
          rollMultiplier: character.blightStage === 2 ? 1.5 : 1.0,
          noMonsters: character.blightStage >= 3,
          noGathering: character.blightStage >= 4
        };

        await character.save();
        console.log(`[blightHandler]: Saved progression for ${character.name} to Stage ${character.blightStage}`);

        const stageInfo = stageDescriptions[character.blightStage] || { 
          title: 'Unknown Stage', 
          desc: 'An unknown error occurred. Please contact support.' 
        };
        const embed = new EmbedBuilder()
          .setColor('#AD1457')
          .setTitle(stageInfo.title)
          .setDescription(
            `${stageInfo.desc}\n\n` +
            (character.blightStage === 5
              ? `❗ **Missed Roll**: Your blight is at the final stage and you are on the edge of death.\n\n` +
                `🕒 **Deadline**: <t:${Math.floor(character.deathDeadline.getTime() / 1000)}:F>\n\n` +
                `⚠️ You must be healed by a **Dragon** before the deadline to avoid death.`
              : `❗ **Missed Roll**: Your blight has progressed. Further missed rolls will increase its severity.`)
          )
          .setFooter({ text: 'Missed roll - Blight progressed!' })
          .setAuthor({
            name: 'Blight Progression Alert',
            iconURL: 'https://static.wixstatic.com/media/7573f4_a510c95090fd43f5ae17e20d80c1289e~mv2.png'
          })
          .setThumbnail(character.icon)
          .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
          .setTimestamp();

        await channel.send({ content: `<@${character.userId}>`, embeds: [embed] });
        console.log(`[blightHandler]: ${character.name} progressed to Stage ${character.blightStage}`);
      }
    }
    
    console.log('[blightHandler]: Completed checkMissedRolls successfully');
  } catch (error) {
    handleError(error, 'blightHandler.js');
    console.error('[blightHandler]: ❌ Error checking missed rolls:', error);
  }
}

// ------------------- Function: getCharacterBlightHistory -------------------
// Retrieves the blight progression history for a character
async function getCharacterBlightHistory(characterId, limit = 10) {
  try {
    const BlightRollHistory = require('../models/BlightRollHistoryModel');
    const history = await BlightRollHistory.find({ characterId })
      .sort({ timestamp: -1 })
      .limit(limit);
    return history;
  } catch (error) {
    handleError(error, 'blightHandler.js');
    console.error('[blightHandler]: Error fetching blight history:', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Module Exports -------------------
// Exported functions for use in other parts of the app
// ============================================================================

module.exports = {
  loadBlightSubmissions,
  saveBlightSubmissions,
  healBlight,
  submitHealingTask,
  rollForBlightProgression,
  postBlightRollCall,
  viewBlightHistory,
  cleanupExpiredBlightRequests,
  validateCharacterOwnership,
  checkMissedRolls,
  getCharacterBlightHistory
};
