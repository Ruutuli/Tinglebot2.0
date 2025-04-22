// ------------------- Imports -------------------
require('dotenv').config();

// ------------------- Node.js Standard Modules -------------------
const fs = require('fs');
const { handleError } = require('../utils/globalErrorHandler');
const { v4: uuidv4 } = require('uuid')

// ------------------- Third-Party Libraries -------------------
const { EmbedBuilder } = require('discord.js');

// ------------------- Models -------------------
const Character = require('../models/CharacterModel');

// ------------------- Utilities -------------------
const { getModCharacterByName } = require('../modules/modCharacters');
const { removeItemInventoryDatabase } = require('../utils/inventoryUtils');
const { authorizeSheets, updateDataInSheet, appendSheetData, extractSpreadsheetId } = require('../utils/googleSheetsUtils');
const { saveSubmissionToStorage, deleteSubmissionFromStorage  } = require('../utils/storage');
const { generateUniqueId } = require('../utils/uniqueIdUtils');

// ------------------- Services -------------------
const { appendSpentTokens, updateTokenBalance, getTokenBalance, getOrCreateToken, fetchItemByName, getCharacterInventoryCollection, fetchCharacterById} = require('../database/db');

// Channel ID for Blight Notifications
const channelId = process.env.BLIGHT_NOTIFICATIONS_CHANNEL_ID;

// ------------------- Load and Save Blight Submissions -------------------
// Load blight submissions from file
function loadBlightSubmissions() {
  try {
    const data = fs.readFileSync('./data/blight.json', 'utf8');
    return data ? JSON.parse(data) : {};
  } catch (error) {
    handleError(error, 'blightHandler.js');

    console.error('Error loading blight submissions:', error);
    return {};
  }
}

// Save blight submissions to file
function saveBlightSubmissions(submissions) {
  fs.writeFileSync('./data/blight.json', JSON.stringify(submissions, null, 2));
}

// ------------------- Get Random Healing Requirement -------------------
// Select a random healing requirement from the healer's available options
function getRandomHealingRequirement(healer, characterName) {
  const requirements = healer.getHealingRequirements(characterName);
  const randomIndex = Math.floor(Math.random() * requirements.length); 
  return requirements[randomIndex];
}

// ------------------- Heal Blight -------------------
// Handles blight healing requests and initiates the healing submission process
async function healBlight(interaction, characterName, healerName) {
  try {
    const character = await Character.findOne({ name: characterName });

    if (!character) {
      await interaction.reply({ content: `Character "${characterName}" not found.`, ephemeral: true });
      return;
    }

    // ------------------- Validation: Check if the character is blighted -------------------
    if (!character.blighted) {
      await interaction.reply({ content: `**${characterName}** is not blighted and does not require healing.`, ephemeral: true });
      return;
    }

    // Retrieve healer details
    const healer = getModCharacterByName(healerName);

    if (!healer) {
      await interaction.reply({ content: `Healer "${healerName}" not found.`, ephemeral: true });
      return;
    }

    // ------------------- Validation: Check if the healer is from the same village -------------------
    if (character.currentVillage.toLowerCase() !== healer.village.toLowerCase()) {
      await interaction.reply({
        content: `**${healer.name}** cannot heal **${characterName}** because they are from different villages.`,
        ephemeral: true,
      });
      return;
    }

    const blightStage = character.blightStage || 1;

    // ------------------- Blight Stage Healing Restrictions -------------------
    if (blightStage <= 2 && !['Sage', 'Oracle', 'Dragon'].includes(healer.category)) {
      await interaction.reply({
        content: `**${healer.name}** cannot heal **${characterName}** at Blight Stage ${blightStage}. Only Sages, Oracles, and Dragons can heal this stage.`,
        ephemeral: true,
      });
      return;
    }

    if (blightStage === 3 && !['Oracle', 'Dragon'].includes(healer.category)) {
      await interaction.reply({
        content: `**${healer.name}** cannot heal **${characterName}** at Blight Stage 3. Only Oracles and Dragons can heal this stage.`,
        ephemeral: true,
      });
      return;
    }

    if (blightStage === 4 && healer.category !== 'Dragon') {
      await interaction.reply({
        content: `**${healer.name}** cannot heal **${characterName}** at Blight Stage 4. Only Dragons can heal this stage.`,
        ephemeral: true,
      });
      return;
    }

    const healingRequirement = getRandomHealingRequirement(healer, characterName);
    const roleplayResponse = healer.roleplayResponseBefore(characterName);

    // ------------------- Check for Existing Submission and Update if Found -------------------
    const blightSubmissions = loadBlightSubmissions();
    const existingSubmissionId = Object.keys(blightSubmissions).find(submissionId => {
      const submission = blightSubmissions[submissionId];
      return submission.characterName === characterName && submission.userId === interaction.user.id;
    });

    const submissionId = existingSubmissionId || generateUniqueId('B'); // 'B' as a prefix for Blight submissions

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

 // ------------------- Send the Healing Request Embed -------------------
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
  .addFields(fields)  // ← now passes an array, not separate args
  .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
  .setFooter({ text: 'Use the Submission ID when you submit your task with /blight submit' })
  .setTimestamp();

// Mention the user in the channel
await interaction.reply({
  content: `<@${interaction.user.id}>`,
  embeds: [embed],
  ephemeral: false,
});

// Attempt to send the embed as a DM
try {
  await interaction.user.send({
    content: `Hi <@${interaction.user.id}>, here are the details of your healing request:`,
    embeds: [embed],
  });
} catch (error) {
  handleError(error, 'blightHandler.js');
  console.error(`Failed to send DM to user ${interaction.user.id}:`, error);
}

} catch (error) {
    handleError(error, 'blightHandler.js');

  console.error('Error healing blight:', error);
  await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
}
}

// ------------------- Submit Healing Task -------------------
// Submits the healing task once the user completes the required task
async function submitHealingTask(interaction, submissionId, item = null, link = null, tokens = false) {
  try {
    // ------------------- Defer the Interaction -------------------
    await interaction.deferReply({ ephemeral: false }); // Ensures the interaction does not expire

    // ------------------- Load and Validate Submission -------------------
    const blightSubmissions = loadBlightSubmissions();
    const submission = blightSubmissions[submissionId];

    if (!submission) {
      await interaction.editReply({ content: `Submission with ID "${submissionId}" not found.` });
      return;
    }

    // Fetch the character associated with the submission
    const character = await Character.findOne({ name: submission.characterName });
    if (!character) {
      await interaction.editReply({ content: `Character "${submission.characterName}" not found.` });
      return;
    }

    // Fetch the healer specified in the submission
    const healer = getModCharacterByName(submission.healerName);
    if (!healer) {
      await interaction.editReply({ content: `Healer "${submission.healerName}" not found.` });
      return;
    }

    // ------------------- Token Forfeit Option -------------------
if (tokens) {
  const currentTokenBalance = await getTokenBalance(interaction.user.id);

  if (currentTokenBalance <= 0) {
      await interaction.editReply({ content: 'You do not have enough tokens to forfeit. You must have more than 0 tokens to use this option.' });
      return;
  }

  await updateTokenBalance(interaction.user.id, -currentTokenBalance);
  submission.status = 'completed';
  submission.submittedAt = new Date().toISOString();
  submission.forfeitTokens = true;

  // Ensure Blight healing prompt is removed from the database
  delete blightSubmissions[submissionId];
  saveBlightSubmissions(blightSubmissions);
  deleteSubmissionFromStorage(submissionId);

  const token = await getOrCreateToken(interaction.user.id);
  const embed = new EmbedBuilder()
      .setColor('#AA926A')
      .setTitle(`Blight Healing Completed for ${submission.characterName}`)
      .setDescription(`You have forfeited **${currentTokenBalance} tokens** in exchange for healing **${submission.characterName}**.`)
      .setThumbnail(healer.iconUrl)
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
      .setDescription(`${healer.roleplayResponseAfter(submission.characterName)}

You have forfeited **${currentTokenBalance} tokens** in exchange for healing **${submission.characterName}**.`)
      .setFooter({ text: 'Healing status successfully updated.' })
      .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  character.blighted = false;
  character.blightStage = 0;
  await character.save();

  return;
}

   // ------------------- Item Submission -------------------
if (submission.taskType === 'item') {
  if (!item) {
      await interaction.editReply({
          content: `You must provide an item to submit for healing by **${healer.name}**.`,
          ephemeral: true,
      });
      return;
  }

  const healingItems = healer.getHealingRequirements(submission.characterName).find(req => req.type === 'item').items;
  const [itemName, itemQuantity] = item.split(' x');
  const itemQuantityInt = parseInt(itemQuantity, 10);
  const requiredItem = healingItems.find(i => i.name === itemName && i.quantity === itemQuantityInt);

  if (!requiredItem) {
      await interaction.editReply({
          content: `**${itemName} x${itemQuantityInt}** doesn’t seem to be one of the items **${healer.name}** mentioned! Please check the requirements and try again with the correct item.`,
          ephemeral: true,
      });
      return;
  }

  // Utility to escape special characters in a string for use in regular expressions
  function escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escapes special characters
  }

  const hasItem = async (characterId, itemName, requiredQuantity) => {
      try {
          console.log(`[hasItem]: Fetching inventory for character ID: ${characterId}`);

          const character = await fetchCharacterById(characterId);
          const collection = await getCharacterInventoryCollection(character.name);

          console.log(`[hasItem]: Connected to inventory collection.`);

          // Fetch all inventory items for the character
          const inventoryItems = await collection.find({}).toArray();

          // Consolidate quantities for items with the same name
          const totalQuantity = inventoryItems
              .filter(item => item.itemName.toLowerCase() === itemName.toLowerCase())
              .reduce((sum, item) => sum + item.quantity, 0);

          console.log(`[hasItem]: Total quantity for item "${itemName}": ${totalQuantity}`);

          return {
              available: totalQuantity >= requiredQuantity,
              quantity: totalQuantity,
          };
      } catch (error) {
    handleError(error, 'blightHandler.js');

          console.error(`[hasItem]: Error fetching inventory for character ID ${characterId}:`, error);
          throw error;
      }
  };

  // Validation usage
  const validationResult = await hasItem(character._id, requiredItem.name, requiredItem.quantity);

  console.log(`[submitHealingTask]: Validation result for item "${requiredItem.name}":`, validationResult);

  if (!validationResult.available) {
      console.log(`[submitHealingTask]: Insufficient quantity for "${requiredItem.name}". ` +
          `Required: ${requiredItem.quantity}, Available: ${validationResult.quantity}`);
      await interaction.editReply({
          content: `**${character.name}** does not have enough of the required item **${requiredItem.name}**. ` +
              `**${character.name}** currently has **${validationResult.quantity}**, but **${requiredItem.quantity}** is needed.`,
          ephemeral: true,
      });
      return;
  }

  // Remove item from inventory
  const removed = await removeItemInventoryDatabase(character._id, itemName, itemQuantityInt, interaction);
  if (!removed) {
      throw new Error(`Failed to remove ${itemName} x${itemQuantityInt} from inventory.`);
  }

  const itemDetails = await fetchItemByName(itemName); // Fetch item details from the database
  const itemEmoji = itemDetails?.emoji || requiredItem.emoji || ''; // Use fetched emoji or fallback to requiredItem.emoji

  const replyMessage = await interaction.editReply({
      embeds: [
          new EmbedBuilder()
              .setColor('#AA926A')
              .setTitle(`${submission.characterName} has been healed of their blight by ${submission.healerName}!`)
              .setDescription(`${healer.roleplayResponseAfter(submission.characterName)}`)
              .addFields(
                  { name: 'Submitted Item', value: `${itemEmoji} **Item**: ${itemName} x${itemQuantityInt}` },
                  { name: 'Inventory Link', value: `[View Inventory](${character.inventory})` }
              )
              .setThumbnail(healer.iconUrl)
              .setAuthor({ name: submission.characterName, iconURL: character.icon })
              .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
              .setFooter({ text: 'Healing status successfully updated.' })
              .setTimestamp()
      ]
  });

  const messageLink = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${replyMessage.id}`;

  // Log the healing to Google Sheets
  const inventoryLink = character.inventory || character.inventoryLink;
  if (inventoryLink) {
      const spreadsheetId = extractSpreadsheetId(inventoryLink);
      const range = 'loggedInventory!A2:M';
      const uniqueSyncId = uuidv4();
      const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      const auth = await authorizeSheets();

      const values = [[
          character.name,         // Character Name
          itemName,               // Item Name
          `-${itemQuantityInt}`,  // Quantity (Negative for usage)
          'Healing',              // Category
          submission.taskType,    // Type
          '',                     // Subtype
          'Blight Healing',       // How it was obtained
          character.job,          // Job
          '',                     // Perk
          character.currentVillage, // Location
          messageLink,            // Link to the reply message
          formattedDateTime,      // Date/Time
          uniqueSyncId            // Sync ID
      ]];

      try {
          await appendSheetData(auth, spreadsheetId, range, values);
      } catch (error) {
    handleError(error, 'blightHandler.js');

          console.error('Error appending to Google Sheets:', error);
      }
  }

  const embed = new EmbedBuilder()
      .setColor('#AA926A')
      .setTitle(`${submission.characterName} has been healed of their blight by ${submission.healerName}!`)
      .setDescription(`${healer.roleplayResponseAfter(submission.characterName)}`)
      .addFields(
          { name: 'Submitted Item', value: `${requiredItem.emoji || itemEmoji} **Item**: ${itemName} x${itemQuantityInt}` },
          { name: 'Inventory Link', value: `[View Inventory](${character.inventory})` }
      )
      .setThumbnail(healer.iconUrl)
      .setAuthor({ name: submission.characterName, iconURL: character.icon })
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
      .setFooter({ text: 'Healing status successfully updated.' })
      .setTimestamp();

  await interaction.editReply({ embeds: [embed], ephemeral: false });

// **CLEAR THE BLIGHT STATUS**
character.blighted   = false;
character.blightStage = 0;
await character.save();

deleteSubmissionFromStorage(submissionId);
saveBlightSubmissions(blightSubmissions);
return;
}


    // ------------------- Art or Writing Submission -------------------
    if (['art', 'writing'].includes(submission.taskType)) {
      if (!link) {
        await interaction.editReply({ content: 'You must provide a link to your submission for healing.' });
        return;
      }

      submission.status = 'completed';
      submission.submittedAt = new Date().toISOString();
      delete blightSubmissions[submissionId]; // Remove the completed submission
      saveBlightSubmissions(blightSubmissions); // Save updated submissions
      deleteSubmissionFromStorage(submissionId); // Ensure persistent deletion     

      const embed = new EmbedBuilder()
      .setColor('#AA926A')
      .setTitle(`${submission.characterName} has been healed of their blight by ${submission.healerName}!`)
      .setDescription(`${healer.roleplayResponseAfter(submission.characterName)}`) // Roleplay response after healing
      .addFields(
        { name: 'Submitted Link', value: `[View Submission](${link})` } // Link as a field
      )
      .setThumbnail(healer.iconUrl)
      .setAuthor({ name: submission.characterName, iconURL: character.icon })
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png') // Add image URL
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

    console.error('Error submitting healing task:', error);
    await interaction.editReply({ content: 'An error occurred while submitting your healing task.' });
  }
}

// ------------------- Roll for Blight Progression -------------------
async function rollForBlightProgression(interaction, characterName) {
  try {
    const character = await Character.findOne({ name: characterName });

    if (!character) {
      await interaction.reply({ content: `Character "${characterName}" not found.`, ephemeral: true });
      return;
    }

    // Validation: Ensure the character is blighted
    if (!character.blighted) {
      await interaction.reply({
        content: `**WOAH! ${characterName} is not blighted! You don’t need to roll for them!** 🌟`,
        ephemeral: true
      });
      return;
    }

    const now = new Date();
const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));

// Calculate the start and end of the current Blight Call window
const currentCallStart = new Date(estNow);
currentCallStart.setDate(estNow.getDate() - (estNow.getHours() < 20 ? 1 : 0)); // Go back a day if before 8 PM
currentCallStart.setHours(20, 0, 0, 0); // Set to 8 PM EST of the previous day

const nextCallStart = new Date(currentCallStart);
nextCallStart.setDate(currentCallStart.getDate() + 1); // Set to 8 PM EST of the current day

console.log(`[blightHandler]⏰ Current Blight Call Window: ${currentCallStart} to ${nextCallStart}`);

const lastRollDate = character.lastRollDate || new Date(0); // Default to epoch if no roll date exists

// Check if the last roll occurred within the current Blight Call window
if (lastRollDate >= currentCallStart && lastRollDate < nextCallStart) {
  console.log(`[blightHandler]⛔ Roll attempt blocked. "${characterName}" already rolled during the current window.`);
  await interaction.reply({
    content: `**${characterName}** has already rolled during the current Blight Call window. You can roll again after **8 PM EST**.`,
    ephemeral: true,
  });
  return;
}

console.log(`[blightHandler]✅ Roll allowed for "${characterName}". Updating lastRollDate.`);

// Update lastRollDate after a successful roll
character.lastRollDate = estNow;
await character.save();

    const user = interaction.user;
    const roll = Math.floor(Math.random() * 1000) + 1;
    let stage;
    let embedDescription;
    let embedTitle;
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
      character.deathDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Set 7-day deadline
      
      embedTitle = `☠ Your Blight Sickness IS ON THE EDGE of STAGE 5 ☠`;
      embedDescription = `⚠️ You are close to death. You have **7 days** to complete your healing prompt, or your OC will die.\n\n` +
        `🕒 **Deadline**: <t:${Math.floor(character.deathDeadline.getTime() / 1000)}:F>\n\n` +
        `To request blight healing, please use </blight heal:1306176789634355241>.`;
      
    } else {
      stage = character.blightStage || 1;
    
      embedTitle = `Your Blight Sickness DOES NOT advance to the next stage.`;
    
      // Handle each stage's message
      switch (stage) {
        case 1:
          embedDescription = `You remain at **Stage 1**.\nInfected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms.\n\nAt this stage, it can be cured by having one of the **Sages, Oracles, or Dragons** heal you.\n\n To request blight healing, please use </blight heal:1306176789634355241>`;
          break;
        case 2:
          embedDescription = `You remain at **Stage 2**.\nInfected areas spread inside and out, and the blight begins traveling towards vital organs. Fatigue fades but nausea typically persists. Infected now experience an increase in physical strength.\n\nThis can still be healed by **Sages, Oracles, and Dragons**.\n\n To request blight healing, please use </blight heal:1306176789634355241>`;
          break;
        case 3:
          embedDescription = `You remain at **Stage 3**.\nVisible infected areas and feverish symptoms fade. Frequent nosebleeds and sputum have a malice-like appearance and can infect others.\n\nThe infected experiences hallucinations, further increased strength, and aggressive mood swings. Monsters no longer attack.\n\nYou can only be healed by **Oracles or Dragons**.\n\n To request blight healing, please use </blight heal:1306176789634355241>`;
          break;
        case 4:
          embedDescription = `You remain at **Stage 4**.\nAll outward signs of infection have subsided - except the eyes. Infected individual's eyes now look like the eyes of Malice.\n\nAt this stage, vital organs begin to fail, and all sense of self is replaced by an uncontrollable desire to destroy. Any contact with bodily fluids risks infecting others.\n\nYou can only be healed by **Dragons** at this stage.\n\n To request blight healing, please use </blight heal:1306176789634355241>`;
          break;
        case 5:
          embedDescription = `You remain at **Stage 5**.\n\n⚠️ The blight has reached its final stage. **You must be healed before the deadline to avoid death.**\n\n To request blight healing, please use </blight heal:1306176789634355241>\n\n🕒 **Deadline**: ${character.deathDeadline?.toLocaleString('en-US', { timeZone: 'America/New_York' })}`;
          break;
        default:
          console.error(`Unknown stage detected for character: ${character.name}, Stage: ${stage}`);
          embedDescription = `Unknown stage detected. Please contact support for assistance.`;
          break;
      }
    }
    
    character.blightStage = stage;
    character.lastRollDate = new Date();
    await character.save();

    const embed = new EmbedBuilder()
      .setColor('#AD1457')
      .setTitle(embedTitle)
      .setDescription(embedDescription)
      .setFooter({ text: `🎲 Roll: ${roll}` })
      .setThumbnail(character.icon)
      .setAuthor({ name: `${characterName}'s Blight Progression`, iconURL: user.displayAvatarURL() })
      .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png');

    await interaction.reply({ content: `<@${user.id}> rolled for ${characterName}`, embeds: [embed] });

  } catch (error) {
    handleError(error, 'blightHandler.js');

    console.error('Error rolling for blight progression:', error);
    await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
  }
}

// ------------------- Post Blight Roll Call -------------------
// Posts the daily roll call reminder at 8 PM EST
async function postBlightRollCall(client) {
  const channelId = process.env.BLIGHT_NOTIFICATIONS_CHANNEL_ID;
  const roleId = process.env.BLIGHT_REMINDER_ROLE_ID;

  const channel = client.channels.cache.get(channelId); // Use the channel ID from the environment variable

  if (!channel) {
    console.error('Channel not found for posting blight roll call.');
    return;
  }

  // Role mention placed outside the embed
  const roleMention = `<@&${roleId}>`;

  const embed = new EmbedBuilder()
    .setColor('#AD1457') // Updated color
    .setTitle('📢 Daily Blight Roll Call! Please roll to see if your Blight gets any worse!')
    .setDescription(
      `**__INSTRUCTIONS__** ▻\n
      Use this command:  
      \`/blight roll character_name\`  
      ➸ And you're done until the next time!
      
      **~~────────────────────~~**  
      ▹ [Blight Information](https://www.rootsofthewild.com/blight 'Blight Information')  
      ▹ [Currently Available Blight Healers](https://discord.com/channels/603960955839447050/651614266046152705/845481974671736842 'Blight Healers')  
      **~~────────────────────~~**  
      :clock8: Blight calls happen every day around 8 PM EST!  
      :alarm_clock: You must complete your roll before the next call for it to be counted!  
      :warning: Remember, if you miss a roll you __automatically progress to the next stage__.
      ▹To request blight healing, please use </blight heal:1306176789634355241>
      `
    )
    .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png') // Added the image at the bottom of the embed
    .setFooter({ text: 'Blight calls happen daily at 8 PM EST!' }) // Removed image from footer
    .setTimestamp();

  // Send role mention separately, then the embed
  await channel.send({ content: roleMention });
  await channel.send({ embeds: [embed] });

  console.log('✅ Blight roll call posted successfully.');
}

// ------------------- Check Missed Rolls -------------------
// Automatically progresses the blight stage if a character misses a roll for 24 hours
async function checkMissedRolls(client) {
  try {
    const blightedCharacters = await Character.find({ blighted: true });

    // Ensure there is a channel to post to
    const channelId = process.env.BLIGHT_NOTIFICATIONS_CHANNEL_ID;
    const channel = client.channels.cache.get(channelId);

    if (!channel) {
      console.error('[blightHandler]❌ Channel not found for missed roll notifications.');
      return;
    }

    // Blight stage descriptions
    const blightStages = {
      1: {
        description: `Infected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms.\n\nAt this stage it can be cured by **sages, oracles, or dragons**.`,
      },
      2: {
        description: `Infected areas spread inside and out, and the blight begins traveling towards vital organs. Fatigue fades but nausea typically persists. Infected now experience an increase in physical strength.\n\nThis can still be healed by **sages, oracles, and dragons**.`,
      },
      3: {
        description: `Visible infected areas and feverish symptoms fade. Frequent nosebleeds and sputum have a malice-like appearance and can infect others. The infected experiences hallucinations, further increased strength, and aggressive mood swings. Monsters no longer attack.\n\nYou can only be healed by **oracles or dragons**.`,
      },
      4: {
        description: `All outward signs of infection have subsided - except the eyes. Infected individual's eyes now look like the eyes of Malice.\n\nAt this stage vital organs begin to fail, and all sense of self is replaced by an uncontrollable desire to destroy. Any contact with bodily fluids risks infecting others.\n\nYou can only be healed by **dragons** at this stage.`,
      },
      5: {
        description: `The final stage...`,
      }
    };

    // Loop through each character to check missed rolls
    for (const character of blightedCharacters) {
      const lastRollDate = character.lastRollDate || new Date(0); // Default to epoch if no roll has been made
      const timeSinceLastRoll = Date.now() - lastRollDate.getTime();

      // Check if the character's death deadline has passed
      if (character.blightStage === 5 && character.deathDeadline) {
        const now = new Date();

        if (now > character.deathDeadline) {
          console.log(`[blightHandler]⚠️ Character ${character.name}'s death deadline has passed.`);

          // Mark the character as dead
          character.blighted = false;
          character.blightStage = 0;
          character.deathDeadline = null; // Clear the deadline
          await character.save();

          // Send the dramatic death alert
          const embed = new EmbedBuilder()
            .setColor('#D32F2F') // Dramatic red for death
            .setTitle(`<:blight_eye:805576955725611058> **Blight Death Alert** <:blight_eye:805576955725611058>`)
            .setDescription(`**${character.name}** has succumbed to Stage 5 Blight.\n\n *This character and all of their items have been removed...*`)
            .setThumbnail(character.icon || 'https://example.com/default-icon.png') // Use the character's icon or a default image
            .setFooter({ text: 'Blight Death Announcement', iconURL: 'https://example.com/blight-icon.png' })
            .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png') // Same image as roll call
            .setTimestamp();

          // Verify and mention the user
          if (character.userId) {
            await channel.send({ content: `<@${character.userId}>`, embeds: [embed] });
          } else {
            console.error(`[Blight Death Alert] Missing userId for character: ${character.name}`);
            await channel.send({ embeds: [embed] });
          }

          console.log(`📨 Notification sent to the Community Board for ${character.name}'s death.`);
          continue; // Skip to the next character
        } else {
          // Notify about the character still being alive with a deadline
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
          console.log(`⚠️ Notification sent for ${character.name}'s Stage 5 deadline.`);
          continue; // Skip to the next character
        }
      }

      if (timeSinceLastRoll > 24 * 60 * 60 * 1000) { // 24 hours in milliseconds
        // Progress to the next stage automatically
        if (character.blightStage < 5) {
          character.blightStage += 1;

          if (character.blightStage === 5) {
            // Set the death deadline when reaching Stage 5
            character.deathDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
          }

          await character.save();

          // Get the blight stage description
          const blightStageInfo = blightStages[character.blightStage] || { description: 'Unknown stage.' };

          // Notify in the channel about the progression
          const embed = new EmbedBuilder()
            .setColor('#AD1457') // Same color as the blight roll call
            .setTitle(`⚠️ ${character.name} has progressed to Blight Stage ${character.blightStage}`)
            .setDescription(`${blightStageInfo.description}\n\n${
              character.blightStage === 5
                ? `❗ **Missed Roll**: Your blight has progressed because you missed your daily roll.\n\n` +
                  `The blight has reached its final stage—a death sentence. Perhaps a last-ditch effort can bring you salvation...\n\nYou can only be saved by a **Dragon**\n` +
                  `🕒 **Deadline**: <t:${Math.floor(character.deathDeadline.getTime() / 1000)}:F>\n\n⚠️ **You must be healed before the deadline to avoid certain death.**`
                : '❗ **Missed Roll**: The blight has progressed because you missed your daily roll. Missing further rolls will cause additional progression.'
            }`)
            .setFooter({ text: `Missed roll - The blight has progressed!` })
            .setAuthor({
              name: 'Blight Progression Alert',
              iconURL: 'https://static.wixstatic.com/media/7573f4_a510c95090fd43f5ae17e20d80c1289e~mv2.png/v1/fill/w_30,h_30,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/icon%20-%20blight.png',
            })
            .setThumbnail(character.icon) // Add character icon as the thumbnail
            .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png') // Same image as roll call
            .setTimestamp();

          await channel.send({ content: `<@${character.userId}>`, embeds: [embed] });

          console.log(
            `[blightHandler]✅ Character ${character.name} has progressed to Stage ${character.blightStage} due to missed roll.`
          );

        } else {
          console.log(`[blightHandler]⚠️ Character ${character.name} is already at Stage 5 (Death).`);
        }
      }
    }
  } catch (error) {
    handleError(error, 'blightHandler.js');

    console.error('[blightHandler]❌ Error checking missed rolls:', error);
  }
}


// ------------------- Module Exports -------------------
module.exports = {
  loadBlightSubmissions,
  saveBlightSubmissions,
  healBlight,
  submitHealingTask,
  rollForBlightProgression,
  postBlightRollCall,
  checkMissedRolls,
};
