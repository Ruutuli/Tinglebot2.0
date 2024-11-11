// ------------------- Imports -------------------
require('dotenv').config();

// Standard library imports
const fs = require('fs');

// Third-party library imports
const { EmbedBuilder } = require('discord.js');

// Local module imports
const Character = require('../models/CharacterModel');
const { getModCharacterByName } = require('../modules/modCharacters');
const { removeItemInventoryDatabase } = require('../utils/inventoryUtils');
const { authorizeSheets, appendSheetData, extractSpreadsheetId } = require('../utils/googleSheetsUtils');
const { saveSubmissionToStorage } = require('../utils/storage');
const { appendSpentTokens, updateTokenBalance, getTokenBalance, getOrCreateToken } = require('../database/tokenService');

// Channel ID for Blight Notifications
const channelId = process.env.BLIGHT_NOTIFICATIONS_CHANNEL_ID;

// ------------------- Load and Save Blight Submissions -------------------
// Load blight submissions from file
function loadBlightSubmissions() {
  try {
    const data = fs.readFileSync('./data/blight.json', 'utf8');
    return data ? JSON.parse(data) : {};
  } catch (error) {
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
    const roleplayResponse = healer.roleplayResponse(characterName);

    // ------------------- Check for Existing Submission and Update if Found -------------------
    const blightSubmissions = loadBlightSubmissions();
    const existingSubmissionId = Object.keys(blightSubmissions).find(submissionId => {
      const submission = blightSubmissions[submissionId];
      return submission.characterName === characterName && submission.userId === interaction.user.id;
    });

    const submissionId = existingSubmissionId || Date.now().toString();

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
    const embed = new EmbedBuilder()
      .setColor('#AA926A')
      .setTitle(`${healer.name} from the village of ${healer.village} has heard your request to heal ${characterName}.`)
      .setDescription(`${roleplayResponse}`)
      .setAuthor({
        name: `${characterName}`, // Character's name
        iconURL: character.icon // Character's icon as the author icon
      })
      .setThumbnail(healer.iconUrl) // Set the healer's icon as the embed's thumbnail
      .addFields(
        { name: 'Healing Requirement', value: `${healingRequirement.description}` },
        { name: 'Submission ID', value: submissionId },
        {
          name: 'Alternative Option',
          value: `If you cannot fulfill this request, you can forfeit all of your total tokens to be healed. Use \`/blight submit\` to forfeit your tokens.`
        }
      )
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
      .setFooter({ text: 'Use the Submission ID when you submit your task with /blight submit' })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });

  } catch (error) {
    console.error('Error healing blight:', error);
    await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
  }
}

// ------------------- Submit Healing Task -------------------
// Submits the healing task once the user completes the required task
async function submitHealingTask(interaction, submissionId, item = null, link = null, tokens = false) {
  try {
    const blightSubmissions = loadBlightSubmissions();
    const submission = blightSubmissions[submissionId];

    if (!submission) {
      await interaction.reply({ content: `Submission with ID "${submissionId}" not found.`, ephemeral: true });
      return;
    }

    const character = await Character.findOne({ name: submission.characterName });
    if (!character) {
      await interaction.reply({ content: `Character "${submission.characterName}" not found.`, ephemeral: true });
      return;
    }

    const healer = getModCharacterByName(submission.healerName);
    if (!healer) {
      await interaction.reply({ content: `Healer "${submission.healerName}" not found.`, ephemeral: true });
      return;
    }

    // ------------------- Token Forfeit Option -------------------
    if (tokens) {
      const currentTokenBalance = await getTokenBalance(interaction.user.id);

      if (currentTokenBalance <= 0) {
        await interaction.reply({ content: 'You do not have enough tokens to forfeit.', ephemeral: true });
        return;
      }

      await updateTokenBalance(interaction.user.id, -currentTokenBalance);
      submission.status = 'completed';
      submission.submittedAt = new Date().toISOString();
      submission.forfeitTokens = true;
      saveBlightSubmissions(blightSubmissions);

      const token = await getOrCreateToken(interaction.user.id);
      const guildId = interaction.guild.id;
      const channelId = interaction.channel.id;

      const message = await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#AA926A')
            .setTitle(`Blight Healing Completed for ${submission.characterName}`)
            .setDescription(`You have forfeited **${currentTokenBalance} tokens** in exchange for healing **${submission.characterName}**.`)
            .addFields({ name: 'Token Tracker', value: `[View your token tracker](${token.tokenTrackerLink})` })
            .setThumbnail(healer.iconUrl)
            .setAuthor({ name: submission.characterName, iconURL: character.icon })
            .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
            .setFooter({ text: 'Healing status successfully updated.' })
            .setTimestamp(),
        ],
        fetchReply: true,
      });

      const messageLink = `https://discord.com/channels/${guildId}/${channelId}/${message.id}`;
      await appendSpentTokens(interaction.user.id, 'Blight Healing Token Forfeit', currentTokenBalance, messageLink);

      character.blighted = false;
      character.blightStage = 0;
      await character.save();

      delete blightSubmissions[submissionId];
      saveBlightSubmissions(blightSubmissions);
      return;
    }

    // ------------------- Item Submission -------------------
    if (submission.taskType === 'item') {
      if (!item) {
        await interaction.reply({ content: `You must provide an item to submit for healing by **${healer.name}**.`, ephemeral: true });
        return;
      }

      const healingItems = healer.getHealingRequirements(submission.characterName).find(req => req.type === 'item').items;
      const [itemName, itemQuantity] = item.split(' x');
      const itemQuantityInt = parseInt(itemQuantity, 10);
      const requiredItem = healingItems.find(i => i.name === itemName && i.quantity === itemQuantityInt);

      if (!requiredItem) {
        await interaction.reply({ content: `The item **${item}** is not valid for healing by **${healer.name}**. Please check the required items.`, ephemeral: true });
        return;
      }

      const hasItem = await removeItemInventoryDatabase(character._id, requiredItem.name, requiredItem.quantity, interaction);
      if (!hasItem) {
        await interaction.reply({ content: `You do not have the required item (**${requiredItem.name}**) to be healed by **${healer.name}**.`, ephemeral: true });
        return;
      }

      submission.status = 'completed';
      submission.submittedAt = new Date().toISOString();
      submission.itemUsed = item;
      saveBlightSubmissions(blightSubmissions);

      const embed = new EmbedBuilder()
        .setColor('#AA926A')
        .setTitle(`${submission.characterName} has been healed of their blight by ${submission.healerName}!`)
        .setDescription(`Item submission received.\n\n**Item**: ${itemName} x${itemQuantityInt}`)
        .setThumbnail(healer.iconUrl)
        .setAuthor({ name: submission.characterName, iconURL: character.icon })
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
        .setFooter({ text: 'Healing status successfully updated.' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: false });
      delete blightSubmissions[submissionId];
      saveBlightSubmissions(blightSubmissions);
      return;
    }

    // ------------------- Art or Writing Submission -------------------
    if (['art', 'writing'].includes(submission.taskType)) {
      if (!link) {
        await interaction.reply({ content: 'You must provide a link to your submission for healing.', ephemeral: true });
        return;
      }

      submission.status = 'completed';
      submission.submittedAt = new Date().toISOString();
      saveBlightSubmissions(blightSubmissions);

      const embed = new EmbedBuilder()
        .setColor('#AA926A')
        .setTitle(`${submission.characterName} has been healed of their blight by ${submission.healerName}!`)
        .setDescription(`${submission.taskType.charAt(0).toUpperCase() + submission.taskType.slice(1)} submission received.`)
        .addFields({ name: 'Submitted Link', value: `[View Submission](${link})` })
        .setThumbnail(healer.iconUrl)
        .setAuthor({ name: submission.characterName, iconURL: character.icon })
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
        .setFooter({ text: 'Healing status successfully updated.' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: false });

      character.blighted = false;
      character.blightStage = 0;
      await character.save();

      delete blightSubmissions[submissionId];
      saveBlightSubmissions(blightSubmissions);
      return;
    }

  } catch (error) {
    console.error('Error submitting healing task:', error);
    await interaction.reply({ content: 'An error occurred while submitting your healing task.', ephemeral: true });
  }
}

// ------------------- Roll for Blight Progression -------------------
async function rollForBlightProgression(interaction, characterName) {
  try {
    const character = await Character.findOne({ name: characterName });

    if (!character) {
      await interaction.reply({ content: `Character "${characterName}" not found.`, ephemeral: false });
      return;
    }

    const lastRollDate = character.lastRollDate || new Date(0);
    const timeSinceLastRoll = Date.now() - lastRollDate.getTime();

    if (timeSinceLastRoll < 24 * 60 * 60 * 1000) {
      await interaction.reply({ content: `You must wait 24 hours before rolling again for **${characterName}**.` });
      return;
    }

    const user = interaction.user;
    const roll = Math.floor(Math.random() * 1000) + 1;
    let stage;
    let embedDescription;
    let embedTitle;
    const blightEmoji = '<:blight_eye:805576955725611058>';

    if (roll <= 25) {
      stage = 2;
      embedTitle = `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 2 ${blightEmoji}`;
      embedDescription = `You are now at **Stage 2**. You can still be healed by Oracles, Sages & Dragons.`;
    } else if (roll <= 40) {
      stage = 3;
      embedTitle = `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 3 ${blightEmoji}`;
      embedDescription = `You are now at **Stage 3**. You can now only be healed by Oracles or Dragons.`;
    } else if (roll <= 67) {
      stage = 4;
      embedTitle = `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 4 ${blightEmoji}`;
      embedDescription = `You are now at **Stage 4**. Only Dragons can heal you.`;
    } else if (roll <= 100) {
      stage = 5;
      embedTitle = `☠ Your Blight Sickness IS ON THE EDGE of STAGE 5 ☠`;
      embedDescription = `You are close to death. You have 7 days to complete your healing prompt, or your OC will die.`;
    } else {
      stage = character.stage || 1;
      embedTitle = `Your Blight Sickness DOES NOT advance to the next stage.`;
      embedDescription = `You remain at **Stage ${stage}**. You can still be healed by Oracles, Sages & Dragons.`;
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
    console.error('Error rolling for blight progression:', error);
    await interaction.reply({ content: 'An error occurred while processing your request.' });
  }
}

// ------------------- Post Blight Roll Call -------------------
// Posts the daily roll call reminder at 8 PM EST
async function postBlightRollCall(client) {
  const channel = client.channels.cache.get('651614266046152705'); // ID of the channel

  if (!channel) {
    console.error('Channel not found for posting blight roll call.');
    return;
  }

  // Role mention placed outside the embed
  const roleMention = '<@&798387447967907910>';

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
    const channel = client.channels.cache.get('651614266046152705'); // Replace with the actual channel ID
    if (!channel) {
      console.error('Channel not found for missed roll notifications.');
      return;
    }

    // Blight stage descriptions
    const blightStages = {
      1: {
        description: `Infected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms.\n\nAt this stage it can be cured by sages, oracles, or dragons.`,
      },
      2: {
        description: `Infected areas spread inside and out, and the blight begins traveling towards vital organs. Fatigue fades but nausea typically persists. Infected now experience an increase in physical strength.\n\nThis can still be healed by sages, oracles, and dragons.`,
      },
      3: {
        description: `Visible infected areas and feverish symptoms fade. Frequent nosebleeds and sputum have a malice-like appearance and can infect others. The infected experiences hallucinations, further increased strength, and aggressive mood swings. Monsters no longer attack.\n\nYou can only be healed by oracles or dragons.`,
      },
      4: {
        description: `All outward signs of infection have subsided - except the eyes. Infected individual's eyes now look like the eyes of Malice.\n\nAt this stage vital organs begin to fail, and all sense of self is replaced by an uncontrollable desire to destroy. Any contact with bodily fluids risks infecting others.\n\nYou can only be healed by dragons at this stage.`,
      },
      5: {
        description: `Death. There is no longer hope of healing.`,
      }
    };

    // Loop through each character to check missed rolls
    for (const character of blightedCharacters) {
      const lastRollDate = character.lastRollDate || new Date(0); // Default to epoch if no roll has been made
      const timeSinceLastRoll = Date.now() - lastRollDate.getTime();

      if (timeSinceLastRoll > 24 * 60 * 60 * 1000) { // 24 hours in milliseconds
        // Progress to the next stage automatically
        if (character.blightStage < 5) {
          character.blightStage += 1;
          await character.save();

          // Get the blight stage description
          const blightStageInfo = blightStages[character.blightStage] || { description: 'Unknown stage.' };

          // Notify in the channel about the progression
          const embed = new EmbedBuilder()
            .setColor('#AD1457') // Same color as the blight roll call
            .setTitle(`${character.name} has progressed to Blight Stage ${character.blightStage}`)
            .setDescription(`${blightStageInfo.description}\n\n❗ **Missed Roll**: Your blight has progressed because you missed your daily roll. Missing further rolls will cause additional progression.`)
            .setFooter({ text: `Missed roll - your blight has progressed!` })
            .setAuthor({ name: 'Blight Progression Alert', iconURL: 'https://static.wixstatic.com/media/7573f4_a510c95090fd43f5ae17e20d80c1289e~mv2.png/v1/fill/w_30,h_30,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/icon%20-%20blight.png' })
            .setThumbnail(character.icon) // Add character icon as the thumbnail
            .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png') // Same image as roll call
            .setTimestamp();

          await channel.send({ content: `<@${character.userId}>`, embeds: [embed] });

          console.log(`Character ${character.name} has progressed to Stage ${character.blightStage} due to missed roll.`);
        } else {
          console.log(`Character ${character.name} is already at Stage 5 (Death).`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error checking missed rolls:', error);
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
  checkMissedRolls
};
