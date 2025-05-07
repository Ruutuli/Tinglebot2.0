// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

// ------------------- Standard Libraries -------------------
// Built-in Node.js modules
const fs = require('fs');

// ------------------- Environment Variables -------------------
// Load environment variables from .env file
require('dotenv').config();

// ------------------- Discord.js Components -------------------
// Discord embed builder for message formatting
const { EmbedBuilder } = require('discord.js');

// ------------------- Third-Party Libraries -------------------
// UUID generator for unique IDs
const { v4: uuidv4 } = require('uuid');

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
  retrieveSubmissionFromStorage
} = require('../utils/storage');
const { generateUniqueId } = require('../utils/uniqueIdUtils');
const { syncInventory } = require('./syncHandler');

// ============================================================================
// ------------------- Blight Submission Persistence -------------------
// Functions to load and save blight submissions to file.
// ============================================================================

// ------------------- Load Blight Submissions -------------------
// Synchronously reads blight submissions from JSON file.
function loadBlightSubmissions() {
  try {
    const data = fs.readFileSync('./data/blight.json', 'utf8');
    return data ? JSON.parse(data) : {};
  } catch (error) {
    handleError(error, 'blightHandler.js');
    console.error('[blightHandler]: Error loading blight submissions', error);
    return {};
  }
}

// ------------------- Save Blight Submissions -------------------
// Synchronously writes blight submissions to JSON file.
function saveBlightSubmissions(submissions) {
  try {
    fs.writeFileSync('./data/blight.json', JSON.stringify(submissions, null, 2));
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
    if (blightStage <= 2 && !['Sage', 'Oracle', 'Dragon'].includes(healer.category)) {
      await interaction.reply({
        content: `⚠️ **${healer.name}** cannot heal **${characterName}** at Blight Stage ${blightStage}. Only Sages, Oracles, and Dragons can heal this stage.`,
        ephemeral: true,
      });
      return;
    }

    if (blightStage === 3 && !['Oracle', 'Dragon'].includes(healer.category)) {
      await interaction.reply({
        content: `⚠️ **${healer.name}** cannot heal **${characterName}** at Blight Stage 3. Only Oracles and Dragons can heal this stage.`,
        ephemeral: true,
      });
      return;
    }

    if (blightStage === 4 && healer.category !== 'Dragon') {
      await interaction.reply({
        content: `⚠️ **${healer.name}** cannot heal **${characterName}** at Blight Stage 4. Only Dragons can heal this stage.`,
        ephemeral: true,
      });
      return;
    }

    const healingRequirement = getRandomHealingRequirement(healer, characterName);
    const roleplayResponse = healer.roleplayResponseBefore(characterName);

    // Load or initialize submissions
    const blightSubmissions = loadBlightSubmissions();
    const existingSubmissionId = Object.keys(blightSubmissions).find((id) => {
      const sub = blightSubmissions[id];
      return sub.characterName === characterName && sub.userId === interaction.user.id;
    });
    const submissionId = existingSubmissionId || generateUniqueId('B');

    blightSubmissions[submissionId] = {
      submissionId,
      userId: interaction.user.id,
      characterName,
      healerName,
      taskType: healingRequirement.type,
      taskDescription: healingRequirement.description,
      healingStage: blightStage,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    saveBlightSubmissions(blightSubmissions);
    saveSubmissionToStorage(submissionId, blightSubmissions[submissionId]);

    // Build embed
    const fields = [
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
    ];

    const embed = new EmbedBuilder()
      .setColor('#AA926A')
      .setTitle(`${healer.name} from the village of ${healer.village} has heard your request to heal ${characterName}.`)
      .setDescription(roleplayResponse)
      .setAuthor({ name: characterName, iconURL: character.icon })
      .setThumbnail(healer.iconUrl)
      .addFields(fields)
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
      .setFooter({ text: 'Use the Submission ID when you submit the task with /blight submit' })
      .setTimestamp();

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
    const blightSubmissions = loadBlightSubmissions();
    const submission = blightSubmissions[submissionId];

    if (!submission) {
      await interaction.editReply({ content: `❌ Submission with ID "${submissionId}" not found.` });
      return;
    }

    const character = await Character.findOne({ name: submission.characterName });
    if (!character) {
      await interaction.editReply({ content: `❌ Character "${submission.characterName}" not found.` });
      return;
    }

    const healer = getModCharacterByName(submission.healerName);
    if (!healer) {
      await interaction.editReply({ content: `❌ Healer "${submission.healerName}" not found.` });
      return;
    }

    // ------------------- Force Inventory Sync Before Healing -------------------
    if (!character.inventorySynced) {
      await interaction.editReply({
        content: '🔄 **Syncing inventory before healing attempt...**'
      });
      await syncInventory(character.name, interaction.user.id, interaction);
      // Refresh character data after sync
      character = await Character.findOne({ name: submission.characterName });
      if (!character.inventorySynced) {
        return void await interaction.editReply({
          content: '❌ **Inventory sync failed. Please try again or contact support.**'
        });
      }
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

      delete blightSubmissions[submissionId];
      saveBlightSubmissions(blightSubmissions);
      deleteSubmissionFromStorage(submissionId);

      character.blighted = false;
      character.blightStage = 0;
      await character.save();

      const embed = new EmbedBuilder()
        .setColor('#AA926A')
        .setTitle(`Blight Healing Completed for ${submission.characterName}`)
        .setDescription(`${healer.roleplayResponseAfter(submission.characterName)}

You have forfeited **${currentTokenBalance} tokens** in exchange for healing **${submission.characterName}**.`)
        .setThumbnail(healer.iconUrl)
        .setFooter({ text: 'Healing status successfully updated.' })
        .setTimestamp();

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

      character.blighted = false;
      character.blightStage = 0;
      await character.save();

      deleteSubmissionFromStorage(submissionId);
      saveBlightSubmissions(blightSubmissions);

      const embed = new EmbedBuilder()
        .setColor('#AA926A')
        .setTitle(`${submission.characterName} has been healed of their blight by ${submission.healerName}!`)
        .setDescription(`${healer.roleplayResponseAfter(submission.characterName)}`)
        .addFields(
          { name: 'Submitted Item', value: `${requiredItem.emoji || ''} **Item**: ${itemName} x${itemQuantityInt}` },
          { name: 'Inventory Link', value: `[View Inventory](${character.inventory})` }
        )
        .setThumbnail(healer.iconUrl)
        .setAuthor({ name: submission.characterName, iconURL: character.icon })
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
        .setFooter({ text: 'Healing status successfully updated.' })
        .setTimestamp();

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
      delete blightSubmissions[submissionId];
      saveBlightSubmissions(blightSubmissions);
      deleteSubmissionFromStorage(submissionId);

      const embed = new EmbedBuilder()
        .setColor('#AA926A')
        .setTitle(`${submission.characterName} has been healed of their blight by ${submission.healerName}!`)
        .setDescription(`${healer.roleplayResponseAfter(submission.characterName)}`)
        .addFields({ name: 'Submitted Link', value: `[View Submission](${link})` })
        .setThumbnail(healer.iconUrl)
        .setAuthor({ name: submission.characterName, iconURL: character.icon })
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
        .setFooter({ text: 'Healing status successfully updated.' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], ephemeral: false });

      character.blighted = false;
      character.blightStage = 0;
      await character.save();
      deleteSubmissionFromStorage(submissionId);
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
      `\`/blight roll character_name\`  \n` +
      `➸ And you're done until the next time!\n\n` +
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

// ------------------- Check Missed Rolls -------------------
// Automatically progresses the blight stage if a character misses a roll for 24 hours.
async function checkMissedRolls(client) {
  try {
    if (!client || !client.channels) {
      console.error('[blightHandler]: Invalid Discord client.');
      return;
    }

    const channelId = process.env.BLIGHT_NOTIFICATIONS_CHANNEL_ID;
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      console.error('[blightHandler]: Channel not found for missed roll notifications.');
      return;
    }

    const blightedCharacters = await Character.find({ blighted: true });
    const blightStages = {
      1: { description: `Infected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms.\n\nAt this stage it can be cured by **sages, oracles, or dragons**.` },
      2: { description: `Infected areas spread inside and out, and the blight begins traveling towards vital organs. Fatigue fades but nausea typically persists. Infected now experience an increase in physical strength.\n\nThis can still be healed by **sages, oracles, and dragons**.` },
      3: { description: `Visible infected areas and feverish symptoms fade. Frequent nosebleeds and sputum have a malice-like appearance and can infect others. The infected experiences hallucinations, further increased strength, and aggressive mood swings. Monsters no longer attack.\n\nYou can only be healed by **oracles or dragons**.` },
      4: { description: `All outward signs of infection have subsided - except the eyes. Infected individual's eyes now look like the eyes of Malice.\n\nAt this stage vital organs begin to fail, and all sense of self is replaced by an uncontrollable desire to destroy. Any contact with bodily fluids risks infecting others.\n\nYou can only be healed by **dragons** at this stage.` },
      5: { description: `The final stage...` }
    };

    for (const character of blightedCharacters) {
      const lastRollDate = character.lastRollDate || new Date(0);
      const timeSinceLastRoll = Date.now() - lastRollDate.getTime();

      // Handle Stage 5 death or warning
      if (character.blightStage === 5 && character.deathDeadline) {
        if (new Date() > character.deathDeadline) {
          character.blighted = false;
          character.blightStage = 0;
          character.deathDeadline = null;

          // Delete any active blight submissions for this character
          try {
            const blightSubmissions = loadBlightSubmissions();
            const submissionIds = Object.keys(blightSubmissions).filter(id => {
              const submission = blightSubmissions[id];
              return submission.characterName === character.name && submission.status === 'pending';
            });
            
            // Delete each pending submission
            for (const submissionId of submissionIds) {
              delete blightSubmissions[submissionId];
              deleteSubmissionFromStorage(submissionId);
            }
            saveBlightSubmissions(blightSubmissions);
          } catch (error) {
            handleError(error, 'blightHandler.js');
            console.error('[blightHandler]: Error cleaning up blight submissions:', error);
          }

          // Wipe character's inventory from database only
          try {
            const inventoriesConnection = await dbFunctions.connectToInventories();
            const db = inventoriesConnection.useDb("inventories");
            const collectionName = character.name.toLowerCase();
            const inventoryCollection = db.collection(collectionName);
            
            // Delete all items from the character's inventory in database
            await inventoryCollection.deleteMany({ characterId: character._id });
          } catch (error) {
            handleError(error, 'blightHandler.js');
            console.error('[blightHandler]: Error wiping inventory:', error);
          }

          await character.save();

          const embed = new EmbedBuilder()
            .setColor('#D32F2F')
            .setTitle(`<:blight_eye:805576955725611058> **Blight Death Alert** <:blight_eye:805576955725611058>`)
            .setDescription(`**${character.name}** has succumbed to Stage 5 Blight.\n\n *This character's inventory has been cleared from the database, but their inventory sheet remains for record-keeping purposes.*`)
            .setThumbnail(character.icon || 'https://example.com/default-icon.png')
            .setFooter({ text: 'Blight Death Announcement', iconURL: 'https://example.com/blight-icon.png' })
            .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
            .setTimestamp();

          if (character.userId) {
            await channel.send({ content: `<@${character.userId}>`, embeds: [embed] });
          } else {
            console.error(`[blightHandler]: Missing userId for ${character.name}`);
            await channel.send({ embeds: [embed] });
          }
          continue;
        }

        // Stage 5 warning
        const embed = new EmbedBuilder()
          .setColor('#AD1457')
          .setTitle(`⚠️ ${character.name} is at Blight Stage 5`)
          .setDescription(
            `❗ **Missed Roll**: Your blight is at the final stage and you are on the edge of death.\n\n` +
            `🕒 **Deadline**: <t:${Math.floor(character.deathDeadline.getTime() / 1000)}:F>\n\n` +
            `⚠️ **You must be healed before the deadline to avoid certain death.**`
          )
          .setFooter({ text: 'Blight Stage 5 Alert' })
          .setThumbnail(character.icon || 'https://example.com/default-icon.png')
          .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
          .setTimestamp();

        await channel.send({ content: `<@${character.userId}>`, embeds: [embed] });
        continue;
      }

      // Missed roll progression
      if (timeSinceLastRoll > 24 * 60 * 60 * 1000 && character.blightStage < 5) {
        character.blightStage += 1;
        if (character.blightStage === 5) {
          character.deathDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        }
        await character.save();

        const stageInfo = blightStages[character.blightStage] || { description: 'Unknown stage.' };
        const embed = new EmbedBuilder()
          .setColor('#AD1457')
          .setTitle(`⚠️ ${character.name} has progressed to Blight Stage ${character.blightStage}`)
          .setDescription(
            `${stageInfo.description}\n\n` +
            (character.blightStage === 5
              ? `❗ **Missed Roll**: Your blight has progressed because you missed your daily roll.\n\n` +
                `The blight has reached its final stage—a death sentence. Perhaps a last-ditch effort can bring you salvation...\n\nYou can only be saved by a **Dragon**\n` +
                `🕒 **Deadline**: <t:${Math.floor(character.deathDeadline.getTime() / 1000)}:F>\n\n⚠️ **You must be healed before the deadline to avoid certain death.**`
              : '❗ **Missed Roll**: The blight has progressed because you missed your daily roll. Missing further rolls will cause additional progression.')
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
        console.log(`[blightHandler]: ${character.name} progressed to Stage ${character.blightStage}.`);
      }
    }
  } catch (error) {
    handleError(error, 'blightHandler.js');
    console.error('[blightHandler]: Error checking missed rolls:', error);
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
  checkMissedRolls,
};
