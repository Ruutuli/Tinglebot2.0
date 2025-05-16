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
// ============================================================================

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
    console.error('[blightHandler]: ❌ Error connecting to inventories database:', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Blight Submission Persistence -------------------
// Functions to load and save blight submissions using TempData model.
// ============================================================================

// ------------------- Load Blight Submissions -------------------
async function loadBlightSubmissions() {
  try {
    const submissions = await TempData.find({ type: 'blight' });
    return submissions.reduce((acc, submission) => {
      acc[submission.key] = submission.data;
      return acc;
    }, {});
  } catch (error) {
    handleError(error, 'blightHandler.js');
    console.error('[blightHandler]: Error loading blight submissions', error);
    return {};
  }
}

// ------------------- Save Blight Submissions -------------------
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
    handleError(error, 'blightHandler.js');
    console.error('[blightHandler]: Error saving blight submissions', error);
  }
}

// ============================================================================
// ------------------- Blight Healing Logic -------------------
// Functions to handle blight healing requests and submissions.
// ============================================================================

// ------------------- Get Random Healing Requirement -------------------
// Selects a random healing requirement available for the healer.
function getRandomHealingRequirement(healer, characterName) {
  const requirements = healer.getHealingRequirements(characterName);
  const randomIndex = Math.floor(Math.random() * requirements.length);
  return requirements[randomIndex];
}

// ------------------- Heal Blight -------------------
// Initiates the blight healing process for a character by a healer.
async function healBlight(interaction, characterName, healerName) {
  try {
    // Input validation
    if (!characterName || typeof characterName !== 'string') {
      await interaction.reply({ content: '❌ Invalid character name provided.', ephemeral: true });
      return;
    }
    if (!healerName || typeof healerName !== 'string') {
      await interaction.reply({ content: '❌ Invalid healer name provided.', ephemeral: true });
      return;
    }

    const character = await Character.findOne({ name: characterName });
    if (!character) {
      await interaction.reply({ content: `❌ Character "${characterName}" not found.`, ephemeral: true });
      return;
    }

    if (!character.blighted) {
      await interaction.reply({ content: `⚠️ **${characterName}** is not blighted and does not require healing.`, ephemeral: true });
      return;
    }

    if (character.blightPaused) {
      return interaction.reply({
        content: `⏸️ Blight progression is currently **paused** for **${character.name}**.`,
        ephemeral: true
      });
    }

    // Check for existing pending submission
    const existingSubmissions = await TempData.find({
      type: 'blight',
      'data.characterName': characterName,
      'data.status': 'pending',
      expiresAt: { $gt: new Date() }
    });

    if (existingSubmissions.length > 0) {
      const existingSubmission = existingSubmissions[0];
      const timeLeft = Math.ceil((existingSubmission.expiresAt - new Date()) / (1000 * 60 * 60 * 24));
      
      await interaction.reply({
        content: `⚠️ **${characterName}** already has a pending healing request that expires in ${timeLeft} days.\n\n` +
          `Submission ID: \`${existingSubmission.key}\`\n` +
          `Healer: **${existingSubmission.data.healerName}**\n` +
          `Task: ${existingSubmission.data.taskDescription}\n\n` +
          `Please complete or cancel the existing request before creating a new one.`,
        ephemeral: true
      });
      return;
    }

    const healer = getModCharacterByName(healerName);
    if (!healer) {
      await interaction.reply({ content: `❌ Healer "${healerName}" not found.`, ephemeral: true });
      return;
    }

    if (character.currentVillage.toLowerCase() !== healer.village.toLowerCase()) {
      await interaction.reply({
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
      
      await interaction.reply({
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

    // Reply in-channel
    await interaction.reply({
      content: `<@${interaction.user.id}>`,
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
    await interaction.reply({ content: '❌ An error occurred while processing your request.', ephemeral: true });
  }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// Utility functions for common operations
// ============================================================================

// ---- Function: validateCharacterOwnership ----
// Validates that a character exists and belongs to the specified user
async function validateCharacterOwnership(interaction, characterName) {
  const userId = interaction.user.id;
  const character = await Character.findOne({ name: characterName, userId });
  
  if (!character) {
    await interaction.reply({
      content: `❌ You can only perform this action for your **own** characters!`,
      ephemeral: true
    });
    return null;
  }
  
  return character;
}

// ---- Function: validateHealerPermission ----
// Validates if a healer can heal a character at their current blight stage
function validateHealerPermission(healer, blightStage) {
  // Define healing permissions by stage
  const stagePermissions = {
    1: ['Sage', 'Oracle', 'Dragon'],
    2: ['Sage', 'Oracle', 'Dragon'],
    3: ['Oracle', 'Dragon'],
    4: ['Dragon']
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

// ---- Function: completeBlightHealing ----
// Handles the common steps for completing blight healing
async function completeBlightHealing(character) {
  character.blighted = false;
  character.blightStage = 0;
  character.blightEffects = {
    rollMultiplier: 1.0,
    noMonsters: false,
    noGathering: false
  };
  await character.save();
}

// ---- Function: createBlightHealingFields ----
// Creates the standard fields for blight healing embeds
function createBlightHealingFields(healingRequirement, submissionId, expiresAt) {
  return [
    {
      name: '<:bb0:854499720797618207> __Healing Requirement__',
      value: `> **Type**: ${
        healingRequirement.type === 'art'
          ? '🎨 Art'
          : healingRequirement.type === 'writing'
          ? '✍️ Writing'
          : '🍎 Item'
      }\n> ${healingRequirement.description}`,
    },
    {
      name: '<:bb0:854499720797618207> __Submission ID__',
      value: `\`\`\`${submissionId}\`\`\``,
    },
    {
      name: '<:bb0:854499720797618207> __Alternative Option__',
      value: `> If you cannot fulfill this request, you can forfeit all of your total tokens to be healed. Use </blight submit:1306176789634355241> to forfeit your tokens.`,
    },
    {
      name: '<:bb0:854499720797618207> __Expiration__',
      value: `> This request will expire in 30 days (<t:${Math.floor(expiresAt.getTime() / 1000)}:R>).\n> ⚠️ You must complete the healing before expiration or your character will remain blighted.`,
    }
  ];
}

// ---- Function: createBlightHealingEmbed ----
// Creates a standardized embed for blight healing requests
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

// ---- Function: createBlightHealingCompleteEmbed ----
// Creates a standardized embed for completed blight healing
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

// ------------------- Submit Healing Task -------------------
// Processes completed healing tasks, handling items, art/writing, or token forfeiture.
async function submitHealingTask(interaction, submissionId, item = null, link = null, tokens = false) {
  // Validate submissionId
  if (!submissionId || typeof submissionId !== 'string') {
    await interaction.reply({ content: '❌ Invalid submission ID provided.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: false });

  try {
    const submission = await retrieveBlightRequestFromStorage(submissionId);

    if (!submission) {
      await interaction.editReply({ content: `❌ Submission with ID "${submissionId}" not found.` });
      return;
    }

    // Check if submission is still pending
    if (submission.status !== 'pending') {
      await interaction.editReply({ 
        content: `❌ This submission has already been processed. Status: ${submission.status}` 
      });
      return;
    }

    // Check if submission has expired
    if (new Date(submission.expiresAt) < new Date()) {
      await interaction.editReply({ 
        content: `❌ This submission has expired. Please request a new healing task.` 
      });
      return;
    }

    const character = await Character.findOne({ name: submission.characterName });
    if (!character) {
      await interaction.editReply({ content: `❌ Character "${submission.characterName}" not found.` });
      return;
    }

    // Ensure blightStage is defined and valid
    if (typeof character.blightStage !== 'number' || character.blightStage < 0) {
      character.blightStage = 1; // Default to stage 1 if invalid
      await character.save();
    }

    const healer = getModCharacterByName(submission.healerName);
    if (!healer) {
      await interaction.editReply({ content: `❌ Healer "${submission.healerName}" not found.` });
      return;
    }

    // ------------------- Force Inventory Sync Before Healing -------------------
    try {
      await checkInventorySync(character);
    } catch (error) {
      await interaction.editReply({
        content: error.message,
        ephemeral: true
      });
      return;
    }

    // Token forfeit option
    if (tokens) {
      const userId = interaction.user.id;
      const userData = await getTokenBalance(userId);
      const currentTokenBalance = userData.tokens;
      const tokenTrackerLink = userData.tokenTracker;

      if (currentTokenBalance <= 0) {
        await interaction.editReply({
          content: '❌ You do not have enough tokens to forfeit. You must have more than 0 tokens to use this option.',
          ephemeral: true,
        });
        return;
      }

      if (!tokenTrackerLink) {
        await interaction.editReply({
          content: '❌ You cannot forfeit tokens because you do not have a token tracker set up. Please set up your token tracker first!',
          ephemeral: true,
        });
        return;
      }

      await updateTokenBalance(userId, -currentTokenBalance);

      // Log token forfeiture to Google Sheets
      try {
        const spreadsheetId = extractSpreadsheetId(tokenTrackerLink);
        const auth = await authorizeSheets();
        const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
        const tokenRow = [
          [
            'Blight Healing',
            interactionUrl,
            'blight healing',
            'spent',
            `-${currentTokenBalance}`
          ]
        ];
        await safeAppendDataToSheet(character.inventory, character, 'loggedTracker!B7:F', tokenRow);
      } catch (sheetError) {
        handleError(sheetError, 'blightHandler.js');
        console.error('[blightHandler]: Error logging token forfeiture', sheetError);
      }

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

    // Item submission
    if (submission.taskType === 'item') {
      if (!item) {
        await interaction.editReply({
          content: `❌ You must provide an item to submit for healing by **${healer.name}**.`,
          ephemeral: true,
        });
        return;
      }

      const healingItems = healer.getHealingRequirements(submission.characterName)
        .find((req) => req.type === 'item').items;
      const [itemName, itemQuantity] = item.split(' x');
      const itemQuantityInt = parseInt(itemQuantity, 10);
      const requiredItem = healingItems.find((i) =>
        i.name === itemName && i.quantity === itemQuantityInt
      );

      if (!requiredItem) {
        await interaction.editReply({
          content: `❌ **${itemName} x${itemQuantityInt}** doesn't seem to be one of the items **${healer.name}** mentioned! Please check the requirements and try again with the correct item.`,
          ephemeral: true,
        });
        return;
      }

      // Check inventory
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
          content: `❌ **${character.name}** does not have enough of the required item **${requiredItem.name}**. **${character.name}** currently has **${validationResult.quantity}**, but **${requiredItem.quantity}** is needed.`,
          ephemeral: true,
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
          await safeAppendDataToSheet(character.inventory, character, 'loggedInventory!A2:M', values);
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

    // Art or Writing submission
    if (['art', 'writing'].includes(submission.taskType)) {
      if (!link) {
        await interaction.editReply({ content: '❌ You must provide a link to your submission for healing.' });
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

// ============================================================================
// ------------------- Blight Progression -------------------
// Functions for rolling and scheduled progression.
// ============================================================================

// ------------------- Roll For Blight Progression -------------------
// Rolls to advance or maintain a character's blight stage once per daily window.
async function rollForBlightProgression(interaction, characterName) {
  try {
    if (!characterName || typeof characterName !== 'string') {
      await interaction.reply({ content: '❌ Invalid character name provided.', ephemeral: true });
      return;
    }

    const character = await Character.findOne({ name: characterName });
    if (!character) {
      await interaction.reply({ content: `❌ Character "${characterName}" not found.`, ephemeral: true });
      return;
    }

    if (!character.blighted) {
      await interaction.reply({
        content: `**WOAH! ${characterName} is not blighted! You don't need to roll for them!** 🌟`,
        ephemeral: true,
      });
      return;
    }

    const now = new Date();
    const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

    // Calculate Blight Call window
    const currentCallStart = new Date(estNow);
    currentCallStart.setDate(estNow.getDate() - (estNow.getHours() < 20 ? 1 : 0));
    currentCallStart.setHours(20, 0, 0, 0);
    const nextCallStart = new Date(currentCallStart);
    nextCallStart.setDate(currentCallStart.getDate() + 1);

    const lastRollDate = character.lastRollDate || new Date(0);
    if (lastRollDate >= currentCallStart && lastRollDate < nextCallStart) {
      await interaction.reply({
        content: `**${characterName}** has already rolled during the current Blight Call window. You can roll again after **8 PM EST**.`,
        ephemeral: true,
      });
      return;
    }

    character.lastRollDate = estNow;
    await character.save();

    const roll = Math.floor(Math.random() * 1000) + 1;
    let stage;
    let embedTitle;
    let embedDescription;
    const blightEmoji = '<:blight_eye:805576955725611058>';

    if (roll <= 25) {
      stage = 2;
      embedTitle = `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 2 ${blightEmoji}`;
      embedDescription = `⚠️ Infected areas spread inside and out, and the blight begins traveling towards vital organs. Fatigue fades but nausea typically persists. Infected now experience an increase in physical strength.\n\nThis can still be healed by **Sages, Oracles, and Dragons**\n\n To request blight healing, please use </blight heal:1306176789634355241>.`;
    } else if (roll <= 40) {
      stage = 3;
      embedTitle = `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 3 ${blightEmoji}`;
      embedDescription = `⚠️ Visible infected areas and feverish symptoms fade. Frequent nosebleeds and sputum have a malice-like appearance and can infect others.\n\nThe infected experiences hallucinations, further increased strength, and aggressive mood swings. Monsters no longer attack.\n\nYou can only be healed by **Oracles or Dragons**\n\n To request blight healing, please use </blight heal:1306176789634355241>.`;
    } else if (roll <= 67) {
      stage = 4;
      embedTitle = `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 4 ${blightEmoji}`;
      embedDescription = `⚠️ All outward signs of infection have subsided - except the eyes. Infected individual's eyes now look like the eyes of Malice.\n\nAt this stage vital organs begin to fail, and all sense of self is replaced by an uncontrollable desire to destroy. Any contact with bodily fluids risks infecting others.\n\nYou can only be healed by **Dragons** at this stage.\n\n To request blight healing, please use </blight heal:1306176789634355241>`;
    } else if (roll <= 100) {
      stage = 5;
      character.deathDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await character.save();
      embedTitle = `☠ Your Blight Sickness IS ON THE EDGE of STAGE 5 ☠`;
      embedDescription = `⚠️ You are close to death. You have **7 days** to complete your healing prompt, or your OC will die.\n\n` +
        `🕒 **Deadline**: <t:${Math.floor(character.deathDeadline.getTime() / 1000)}:F>\n\n` +
        `To request blight healing, please use </blight heal:1306176789634355241>.`;
    } else {
      stage = character.blightStage || 1;
      switch (stage) {
        case 1:
          embedTitle = `Your Blight Sickness DOES NOT advance to the next stage.`;
          embedDescription = `You remain at **Stage 1**.\nInfected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms.\n\nAt this stage, it can be cured by having one of the **Sages, Oracles, or Dragons** heal you.\n\n To request blight healing, please use </blight heal:1306176789634355241>`;
          break;
        case 2:
          embedTitle = `Your Blight Sickness DOES NOT advance to the next stage.`;
          embedDescription = `You remain at **Stage 2**.\nInfected areas spread inside and out, and the blight begins traveling towards vital organs. Fatigue fades but nausea typically persists. Infected now experience an increase in physical strength.\n\nThis can still be healed by **Sages, Oracles, and Dragons**.\n\n To request blight healing, please use </blight heal:1306176789634355241>`;
          break;
        case 3:
          embedTitle = `Your Blight Sickness DOES NOT advance to the next stage.`;
          embedDescription = `You remain at **Stage 3**.\nVisible infected areas and feverish symptoms fade. Frequent nosebleeds and sputum have a malice-like appearance and can infect others.\n\nThe infected experiences hallucinations, further increased strength, and aggressive mood swings. Monsters no longer attack.\n\nYou can only be healed by **Oracles or Dragons**.\n\n To request blight healing, please use </blight heal:1306176789634355241>`;
          break;
        case 4:
          embedTitle = `Your Blight Sickness DOES NOT advance to the next stage.`;
          embedDescription = `You remain at **Stage 4**.\nAll outward signs of infection have subsided - except the eyes. Infected individual's eyes now look like the eyes of Malice.\n\nAt this stage, vital organs begin to fail, and all sense of self is replaced by an uncontrollable desire to destroy. Any contact with bodily fluids risks infecting others.\n\nYou can only be healed by **Dragons** at this stage.\n\n To request blight healing, please use </blight heal:1306176789634355241>`;
          break;
        case 5:
          embedTitle = `Your Blight Sickness DOES NOT advance to the next stage.`;
          embedDescription = `You remain at **Stage 5**.\n\n⚠️ The blight has reached its final stage. **You must be healed before the deadline to avoid death.**\n\n To request blight healing, please use </blight heal:1306176789634355241>\n\n🕒 **Deadline**: ${character.deathDeadline?.toLocaleString('en-US', { timeZone: 'America/New_York' })}`;
          break;
        default:
          console.error(`[blightHandler]: Unknown stage ${stage} for ${characterName}`);
          embedTitle = `Unknown Stage`;
          embedDescription = `An unknown error occurred. Please contact support.`;
      }
    }

    character.blightStage = stage;
    
    // Apply stage-specific effects
    character.blightEffects = {
      rollMultiplier: stage === 2 ? 1.5 : 1.0,  // Stage 2: 1.5x multiplier on all rolls
      noMonsters: stage >= 3,                   // Stage 3+: No monster encounters
      noGathering: stage >= 4                   // Stage 4+: Cannot gather items
    };
    
    await character.save();

    const embed = new EmbedBuilder()
      .setColor('#AD1457')
      .setTitle(embedTitle)
      .setDescription(embedDescription)
      .setFooter({ text: `🎲 Roll: ${roll}` })
      .setThumbnail(character.icon)
      .setAuthor({ name: `${characterName}'s Blight Progression`, iconURL: interaction.user.displayAvatarURL() })
      .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
      .setTimestamp();

    // Add effects information to the embed
    if (stage === 2) {
      embed.addFields({
        name: '🎯 Stage 2 Effect',
        value: 'Your rolls are now multiplied by 1.5x due to increased physical strength.'
      });
    } else if (stage === 3) {
      embed.addFields({
        name: '👻 Stage 3 Effect',
        value: 'Monsters no longer attack you due to your aggressive aura.'
      });
    } else if (stage === 4) {
      embed.addFields({
        name: '💀 Stage 4 Effect',
        value: 'Monsters no longer attack you, and you have lost all desire to gather items.'
      });
    }

    await interaction.reply({ content: `<@${interaction.user.id}> rolled for ${characterName}`, embeds: [embed] });
  } catch (error) {
    handleError(error, 'blightHandler.js');
    console.error('[blightHandler]: Error rolling for blight progression:', error);
    await interaction.reply({ content: '❌ An error occurred while processing your request.', ephemeral: true });
  }
}

// ------------------- Post Blight Roll Call -------------------
// Sends daily reminder to roll for blight progression at 8 PM EST.
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
      `:clock8: Blight calls happen every day around 8 PM EST!  \n` +
      `:alarm_clock: You must complete your roll before the next call for it to be counted!  \n` +
      `:warning: Remember, if you miss a roll you __automatically progress to the next stage__.  \n` +
      `▹To request blight healing, please use </blight heal:1306176789634355241>`
    )
    .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
    .setFooter({ text: 'Blight calls happen daily at 8 PM EST!' })
    .setTimestamp();

  await channel.send({ content: `<@&${roleId}>` });
  await channel.send({ embeds: [embed] });

  console.log('[blightHandler]: Blight roll call posted successfully.');
}

// ------------------- View Blight History -------------------
// Displays the blight history for a character
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

// ------------------- Cleanup Expired Blight Requests -------------------
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
// ------------------- Module Exports -------------------
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
  validateCharacterOwnership
};