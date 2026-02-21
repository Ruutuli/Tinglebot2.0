// ------------------- Submit Command Handler -------------------
// Handles the `/submit` command for submitting art or writing and claiming tokens

// ------------------- Imports -------------------
// Standard Library Imports
const path = require('path');

const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
// Discord.js Imports
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

// Handler Imports
const { handleSelectMenuInteraction } = require('../../handlers/selectMenuHandler.js');
const { handleModalSubmission } = require('../../handlers/modalHandler.js');
const { getCancelButtonRow, handleButtonInteraction } = require('../../handlers/componentHandler.js');

// Utility Imports
const { resetSubmissionState, calculateWritingTokens, calculateWritingTokensWithCollab } = require('@/utils/tokenUtils.js');
const { getBaseSelectMenu } = require('@/utils/menuUtils.js');
const { 
  saveSubmissionToStorage, 
  retrieveSubmissionFromStorage, 
  getOrCreateSubmission,
  updateSubmissionData 
} = require('@/utils/storage.js');
const { uploadSubmissionImage } = require('@/utils/uploadUtils.js');
const { createWritingSubmissionEmbed, createArtSubmissionEmbed, updateBoostRequestEmbed } = require('../../embeds/embeds.js');
const User = require('@/models/UserModel.js'); 
const { generateUniqueId } = require('@/utils/uniqueIdUtils.js');
const { applyScholarTokensBoost } = require('../../modules/boostingModule');
const {
  retrieveBoostingRequestFromTempDataByCharacter,
  saveBoostingRequestToTempData,
  updateBoostAppliedMessage
} = require('../jobs/boosting');
const {
  fetchAllCharacters,
  fetchCharacterByNameAndUserId,
  fetchModCharacterByNameAndUserId,
  fetchCharacterByName,
  fetchModCharacterByName
} = require('@/database/db');

async function parseTaggedCharacters(taggedCharactersInput, interaction) {
  let taggedCharacters = [];
  if (!taggedCharactersInput) {
    return taggedCharacters;
  }

  const characterNames = taggedCharactersInput
    .split(',')
    .map(name => name.trim())
    .filter(name => name.length > 0);

  if (characterNames.length === 0) {
    await interaction.editReply({
      content: '❌ **Invalid tagged characters format.** Please provide character names separated by commas.',
      ephemeral: true,
    });
    return null;
  }

  try {
    const allCharacters = await fetchAllCharacters();
    const characterNamesSet = new Set(allCharacters.map(char => char.name.toLowerCase()));

    const invalidCharacters = characterNames.filter(name => !characterNamesSet.has(name.toLowerCase()));
    if (invalidCharacters.length > 0) {
      await interaction.editReply({
        content: `❌ **Invalid character names:** ${invalidCharacters.join(', ')}. Please check that all character names are correct.`,
        ephemeral: true,
      });
      return null;
    }
  } catch (error) {
    handleInteractionError(error, 'submit.js');
    await interaction.editReply({
      content: '❌ **Error validating tagged characters. Please try again later.**',
      ephemeral: true,
    });
    return null;
  }

  return characterNames;
}

async function resolveCharacter(characterName, userId = null) {
  if (!characterName || typeof characterName !== 'string') {
    return null;
  }

  const trimmedName = characterName.trim();
  let character = null;

  if (userId) {
    try {
      character = await fetchCharacterByNameAndUserId(trimmedName, userId);
    } catch (error) {
      console.error(`[submit.js]: ❌ Error fetching character ${trimmedName} by user ${userId}:`, error);
    }

    if (!character) {
      try {
        character = await fetchModCharacterByNameAndUserId(trimmedName, userId);
      } catch (modError) {
        console.error(`[submit.js]: ❌ Error fetching mod character ${trimmedName} by user ${userId}:`, modError);
      }
    }
  }

  if (!character) {
    try {
      character = await fetchCharacterByName(trimmedName);
    } catch (fallbackError) {
      console.error(`[submit.js]: ❌ Error fetching character ${trimmedName}:`, fallbackError);
    }
  }

  if (!character) {
    try {
      character = await fetchModCharacterByName(trimmedName);
    } catch (modFallbackError) {
      console.error(`[submit.js]: ❌ Error fetching mod character ${trimmedName}:`, modFallbackError);
    }
  }

  return character;
}

async function fulfillTokenBoost(characterOrName, client) {
  if (!characterOrName) {
    return;
  }

  const characterName = typeof characterOrName === 'string'
    ? characterOrName
    : characterOrName.name;

  if (!characterName) {
    return;
  }

  let characterDoc = null;
  if (typeof characterOrName === 'object' && typeof characterOrName.save === 'function') {
    characterDoc = characterOrName;
  } else {
    characterDoc = await fetchCharacterByName(characterName);
    if (!characterDoc) {
      characterDoc = await fetchModCharacterByName(characterName);
    }
  }

  if (!characterDoc) {
    console.warn(`[submit.js]: ⚠️ Unable to resolve character document for ${characterName} when clearing boost.`);
    return;
  }

  try {
    const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);
    if (activeBoost && activeBoost.status === 'accepted' && activeBoost.category === 'Tokens') {
      activeBoost.status = 'fulfilled';
      activeBoost.fulfilledAt = Date.now();
      await saveBoostingRequestToTempData(activeBoost.boostRequestId, activeBoost);

      if (client) {
        try {
          await updateBoostRequestEmbed(client, activeBoost, 'fulfilled');
          await updateBoostAppliedMessage(client, activeBoost);
        } catch (embedError) {
          console.error(`[submit.js]: ❌ Failed to update boost embeds for ${characterName}:`, embedError);
        }
      }
    }
  } catch (error) {
    console.error(`[submit.js]: ❌ Failed to mark token boost fulfilled:`, error);
  }

  try {
    if (characterDoc.boostedBy) {
      characterDoc.boostedBy = null;
      await characterDoc.save();
    }
  } catch (saveError) {
    console.error(`[submit.js]: ❌ Failed to clear boost for ${characterName}:`, saveError);
  }
}

// ============================================================================
// ------------------- Command Definition -------------------
// ============================================================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName('submit')
    .setDescription('Submit art or writing for tokens')
    .addSubcommand(subcommand =>
      subcommand
        .setName('art')
        .setDescription('Submit art for tokens')
        .addAttachmentOption(option =>
          option
            .setName('file')
            .setDescription('The art file to submit')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('Title for your submission')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('questid')
            .setDescription('Quest ID if this is for a quest')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('collab')
            .setDescription('Collaborator username if this is a collaboration')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('blightid')
            .setDescription('Blight healing request ID (optional)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('tagged_characters')
            .setDescription('Characters to tag in this submission (comma-separated character names, e.g., "Alice, Bob, Charlie")')
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option
            .setName('group_meme')
            .setDescription('Is this a Group Art Meme? (1.5x tokens; Hard = +1 quest on approval)')
            .setRequired(false)
            .addChoices(
              { name: 'No', value: 'none' },
              { name: 'Yes (Easy – 1.5x tokens)', value: 'easy' },
              { name: 'Yes (Hard – 1.5x tokens + 1 quest on approval)', value: 'hard' }
            )
        )
        .addStringOption(option =>
          option
            .setName('meme_template')
            .setDescription('Meme template name (e.g. Kissing Meme, Daily Routine) – optional')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('writing')
        .setDescription('Submit writing for tokens')
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('Title for your writing submission')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('link')
            .setDescription('Link to your writing (Google Docs, etc.)')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('word_count')
            .setDescription('Word count of your writing')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('description')
            .setDescription('Brief description of your writing')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('questid')
            .setDescription('Quest ID if this is for a quest')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('collab')
            .setDescription('Collaborators (mention multiple users separated by spaces)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('blightid')
            .setDescription('Blight healing request ID (optional)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('tagged_characters')
            .setDescription('Characters to tag in this submission (comma-separated character names, e.g., "Alice, Bob, Charlie")')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('art-notokens')
        .setDescription('Submit art for display (no tokens)')
        .addAttachmentOption(option =>
          option
            .setName('file')
            .setDescription('The art file to submit')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('Title for your submission')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('tagged_characters')
            .setDescription('Characters to tag in this submission (comma-separated character names, e.g., "Alice, Bob, Charlie")')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('writing-notokens')
        .setDescription('Submit writing for display (no tokens)')
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('Title for your writing submission')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('link')
            .setDescription('Link to your writing (Google Docs, etc.)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('description')
            .setDescription('Brief description of your writing')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('tagged_characters')
            .setDescription('Characters to tag in this submission (comma-separated character names, e.g., "Alice, Bob, Charlie")')
            .setRequired(false)
            .setAutocomplete(true)
        )
    ),

  // ------------------- Command Execution -------------------
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    // Tokens are tracked automatically in the database.


    // ------------------- Handle Art Submission -------------------
    if (subcommand === 'art') {
      try {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const user = interaction.user;
        const attachedFile = interaction.options.getAttachment('file');
        const title = interaction.options.getString('title')?.trim() || attachedFile.name; // Use user-input title or default to file name
        const groupMeme = interaction.options.getString('group_meme') || 'none';
        const memeTemplate = interaction.options.getString('meme_template')?.trim() || null;
        const isGroupMeme = groupMeme === 'easy' || groupMeme === 'hard';
        const questId = isGroupMeme ? 'N/A' : (interaction.options.getString('questid') || 'N/A');
        const collabInput = interaction.options.getString('collab');
        const blightId = interaction.options.getString('blightid') || null;
        const taggedCharactersInput = interaction.options.getString('tagged_characters');

        // Parse and validate collaborators
        let collab = [];
        if (collabInput) {
          // Extract all user mentions from the input
          const mentionRegex = /<@(\d+)>/g;
          const mentions = collabInput.match(mentionRegex);
          
          if (!mentions || mentions.length === 0) {
            await interaction.editReply({ 
              content: '❌ **Invalid collaboration format.** Please mention users with @username format (e.g., @User1 @User2).' 
            });
            return;
          }

          collab = mentions;

          // Prevent self-collaboration
          const collaboratorIds = mentions.map(m => m.match(/<@(\d+)>/)?.[1]);
          if (collaboratorIds.includes(user.id)) {
            await interaction.editReply({ 
              content: '❌ **You cannot collaborate with yourself.** Please remove your own mention from the collaborators.' 
            });
            return;
          }

          // Check for duplicate collaborators
          const uniqueIds = new Set(collaboratorIds);
          if (uniqueIds.size !== collaboratorIds.length) {
            await interaction.editReply({ 
              content: '❌ **Duplicate collaborators detected.** Please mention each collaborator only once.' 
            });
            return;
          }
        }

        // Parse and validate tagged characters
        let taggedCharacters = await parseTaggedCharacters(taggedCharactersInput, interaction);
        if (!taggedCharacters) {
          return;
        }

        // Check if a file is attached
        if (!attachedFile) {
          await interaction.editReply({ content: '❌ **No file attached. Please try again.**' });
          return;
        }

        // Fetch user data from the database
        const userData = await User.findOne({ discordId: user.id });
        if (!userData) {
          await interaction.editReply({ content: '❌ **User data not found. Please try again later.**' });
          return;
        }

        const fileName = path.basename(attachedFile.name);
        const discordImageUrl = attachedFile.url;

        // Upload the image to Google Drive or cloud storage
        const googleImageUrl = await uploadSubmissionImage(discordImageUrl, fileName);

        // Create submission data using the new helper
        const submissionId = generateUniqueId('A');
        
        const initialData = {
          submissionId,
          fileUrl: googleImageUrl,
          fileName,
          title,
          userId: user.id,
          username: user.username,
          userAvatar: user.displayAvatarURL({ dynamic: true }),
          category: 'art',
          questEvent: questId,
          questBonus: 'N/A',
          collab: collab.length > 0 ? collab : [],
          blightId: blightId,
          taggedCharacters: taggedCharacters.length > 0 ? taggedCharacters : [],
          isGroupMeme: isGroupMeme,
          memeMode: isGroupMeme ? groupMeme : null,
          memeTemplate: memeTemplate,
        };

        // Save to database using the helper
        await saveSubmissionToStorage(submissionId, initialData);

        // Generate the dropdown menu and cancel button for user options
        const dropdownMenu = getBaseSelectMenu(false);
        const cancelButtonRow = getCancelButtonRow();

        await interaction.editReply({
          content: '🎨 **Submission Received!**\nPlease select a base to proceed with your art submission.',
          components: [dropdownMenu, cancelButtonRow],
          ephemeral: true,
        });

        // Reset submission state
        resetSubmissionState();

      } catch (error) {
        handleInteractionError(error, 'submit.js');
        console.error('Error handling art submission:', error);
        await interaction.editReply({ content: '❌ **Error processing your submission. Please try again later.**' });
      }
    }

    // ------------------- Handle Writing Submission -------------------
    if (subcommand === 'writing') {
      try {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); // Ensure the entire flow starts as ephemeral
    
        const user = interaction.user;
        const title = interaction.options.getString('title')?.trim();
        const link = interaction.options.getString('link');
        const wordCount = interaction.options.getInteger('word_count');
        if (wordCount < 0) {
          await interaction.editReply({
            content: '❌ **Word count cannot be negative. Please provide a valid word count.**',
            ephemeral: true,
          });
          return;
        }
        const description = interaction.options.getString('description') || 'No description provided.';
        const questId = interaction.options.getString('questid') || 'N/A';
        const collabInput = interaction.options.getString('collab');
        const blightId = interaction.options.getString('blightid') || null;
        const taggedCharactersInput = interaction.options.getString('tagged_characters');

        // Parse and validate collaborators
        let collab = [];
        if (collabInput) {
          // Extract all user mentions from the input
          const mentionRegex = /<@(\d+)>/g;
          const mentions = collabInput.match(mentionRegex);
          
          if (!mentions || mentions.length === 0) {
            await interaction.editReply({ 
              content: '❌ **Invalid collaboration format.** Please mention users with @username format (e.g., @User1 @User2).' 
            });
            return;
          }

          collab = mentions;

          // Prevent self-collaboration
          const collaboratorIds = mentions.map(m => m.match(/<@(\d+)>/)?.[1]);
          if (collaboratorIds.includes(user.id)) {
            await interaction.editReply({ 
              content: '❌ **You cannot collaborate with yourself.** Please remove your own mention from the collaborators.' 
            });
            return;
          }

          // Check for duplicate collaborators
          const uniqueIds = new Set(collaboratorIds);
          if (uniqueIds.size !== collaboratorIds.length) {
            await interaction.editReply({ 
              content: '❌ **Duplicate collaborators detected.** Please mention each collaborator only once.' 
            });
            return;
          }
        }

        // Parse and validate tagged characters
        let taggedCharacters = [];
        if (taggedCharactersInput) {
          // Split by comma and trim whitespace
          const characterNames = taggedCharactersInput.split(',').map(name => name.trim()).filter(name => name.length > 0);
          
          if (characterNames.length === 0) {
            await interaction.editReply({ 
              content: '❌ **Invalid tagged characters format.** Please provide character names separated by commas.' 
            });
            return;
          }

          // Validate that all characters exist in the database
          const { fetchAllCharacters } = require('@/database/db');
          const allCharacters = await fetchAllCharacters();
          const characterNamesSet = new Set(allCharacters.map(char => char.name.toLowerCase()));
          
          const invalidCharacters = characterNames.filter(name => !characterNamesSet.has(name.toLowerCase()));
          if (invalidCharacters.length > 0) {
            await interaction.editReply({ 
              content: `❌ **Invalid character names:** ${invalidCharacters.join(', ')}. Please check that all character names are correct.` 
            });
            return;
          }

          taggedCharacters = characterNames;
        }
    
        // Fetch user data from the database
        const userData = await User.findOne({ discordId: user.id });
        if (!userData) {
          await interaction.editReply({ content: '❌ **User data not found. Please try again later.**' });
          return;
        }
    
        // Get quest bonus and collab bonus if quest is linked
        let questBonus = 0;
        let collabBonus = 0;
        if (questId && questId !== 'N/A') {
          const { getQuestBonus, getCollabBonus } = require('@/utils/tokenUtils');
          questBonus = await getQuestBonus(questId, user.id);
          collabBonus = await getCollabBonus(questId);
          console.log(`[submit.js]: 🎯 Quest bonus for ${questId}: ${questBonus}`);
          console.log(`[submit.js]: 🤝 Collab bonus for ${questId}: ${collabBonus}`);
        }

        // Calculate tokens for the writing submission with collaboration splitting
        const tokenCalculation = calculateWritingTokensWithCollab(wordCount, collab, questBonus, collabBonus);
        let finalTokenAmount = tokenCalculation.tokensPerPerson;
        const boostEffects = [];
        const boostedCharacters = new Map();
        const processedBoostTypes = new Set();
        const boostMetadataMap = new Map();

        // Ensure tagged character list is unique while preserving display order
        const normalizedTagSet = new Set();
        const finalTaggedCharacters = [];
        if (Array.isArray(taggedCharacters)) {
          for (const rawName of taggedCharacters) {
            const normalized = rawName.toLowerCase();
            if (normalizedTagSet.has(normalized)) continue;
            normalizedTagSet.add(normalized);
            finalTaggedCharacters.push(rawName);
          }
        }

        const boostCandidateNames = new Set(
          finalTaggedCharacters.map(name => name.trim()).filter(Boolean)
        );


        for (const candidateName of boostCandidateNames) {
          const character = await resolveCharacter(candidateName, interaction.user.id);
          if (!character) {
            continue;
          }

          const normalizedCharacterName = character.name.toLowerCase();
          if (!normalizedTagSet.has(normalizedCharacterName)) {
            normalizedTagSet.add(normalizedCharacterName);
            finalTaggedCharacters.push(character.name);
          }

          if (!character.boostedBy) {
            continue;
          }

          const boosterChar = await resolveCharacter(character.boostedBy);
          if (!boosterChar) {
            console.warn(`[submit.js]: ⚠️ Booster ${character.boostedBy} not found for ${character.name}`);
            continue;
          }

          if (
            boosterChar.job === 'Scholar' &&
            !processedBoostTypes.has('scholar_tokens')
          ) {
            // Verify the boost category is 'Tokens' (Research Stipend) before applying
            const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(character.name);
            const isTokensBoost = activeBoost && activeBoost.status === 'accepted' && activeBoost.category === 'Tokens';
            
            if (isTokensBoost) {
              const boostedTokens = applyScholarTokensBoost(finalTokenAmount);
              const tokenIncrease = boostedTokens - finalTokenAmount;
              if (tokenIncrease > 0) {
                console.log(`[submit.js]: 📚 Scholar boost - Research Stipend applied for ${character.name} by ${boosterChar.name} (+${tokenIncrease} tokens)`);
                finalTokenAmount = boostedTokens;
                boostEffects.push(`📚 **Research Stipend:** ${boosterChar.name} added 🪙 ${tokenIncrease}.`);
                processedBoostTypes.add('scholar_tokens');
                boostedCharacters.set(normalizedCharacterName, character);
                const metadataKey = `${boosterChar.job.toLowerCase()}_${boosterChar.name.toLowerCase()}`;
                if (!boostMetadataMap.has(metadataKey)) {
                  boostMetadataMap.set(metadataKey, {
                    boostType: 'scholar_tokens',
                    boosterJob: boosterChar.job,
                    boosterName: boosterChar.name,
                    targets: new Set(),
                    tokenIncrease: 0
                  });
                }
                const metadataRecord = boostMetadataMap.get(metadataKey);
                metadataRecord.targets.add(character.name);
                metadataRecord.tokenIncrease += tokenIncrease;
              }
            } else {
              console.log(`[submit.js]: 📚 Scholar ${boosterChar.name} boost active for ${character.name} but category is not Tokens (is: ${activeBoost?.category || 'none'}), skipping Research Stipend`);
            }
          }
        }

        taggedCharacters = finalTaggedCharacters;

        const boostTokenIncrease = Math.max(0, finalTokenAmount - tokenCalculation.totalTokens);
        const boostMetadata = Array.from(boostMetadataMap.values()).map(entry => ({
          boostType: entry.boostType,
          boosterJob: entry.boosterJob,
          boosterName: entry.boosterName,
          targets: Array.from(entry.targets),
          tokenIncrease: entry.tokenIncrease
        }));

        // Create a unique submission ID and save to database
        const submissionId = generateUniqueId('W');
        const submissionData = {
          submissionId,
          userId: user.id,
          username: user.username,
          userAvatar: user.displayAvatarURL({ dynamic: true }),
          category: 'writing',
          title,
          wordCount,
          finalTokenAmount,
          tokenCalculation: tokenCalculation.breakdown,
          link,
          description,
          questEvent: questId,
          questBonus: questBonus,
          collab: collab.length > 0 ? collab : [],
          blightId: blightId,
          taggedCharacters: taggedCharacters,
        };
        if (boostEffects.length > 0) {
          submissionData.boostEffects = boostEffects;
        }
        if (boostTokenIncrease > 0) {
          submissionData.boostTokenIncrease = boostTokenIncrease;
        }
        if (boostMetadata.length > 0) {
          submissionData.boostMetadata = boostMetadata;
        }
    
        // Save to database
        await saveSubmissionToStorage(submissionId, submissionData);
        console.log(`[submit.js]: 💾 Saved writing submission: ${submissionId}`);
    
        const embed = createWritingSubmissionEmbed(submissionData);
    
        // Post the embed publicly in the submissions channel
        const submissionsChannel = interaction.client.channels.cache.get('940446392789389362');
        const sentMessage = await submissionsChannel.send({ embeds: [embed] });
        
        // Update with message URL
        await updateSubmissionData(submissionId, { 
          messageUrl: `https://discord.com/channels/${interaction.guildId}/${submissionsChannel.id}/${sentMessage.id}` 
        });

        if (boostEffects.length > 0 && boostedCharacters.size > 0) {
          for (const character of boostedCharacters.values()) {
            await fulfillTokenBoost(character, interaction.client);
          }
        }

        // Send notification to approval channel
        try {
          const approvalChannel = interaction.client.channels.cache.get('1381479893090566144');
          if (approvalChannel?.isTextBased()) {
            // Calculate token display based on collaboration and quest bonus
            let tokenDisplay = `${finalTokenAmount} tokens`;
            
            // Build breakdown showing per-person amounts
            const breakdownParts = [];
            if (tokenCalculation.breakdown.baseTokensPerPerson !== undefined) {
              breakdownParts.push(`${tokenCalculation.breakdown.baseTokensPerPerson} base`);
            } else {
              breakdownParts.push(`${tokenCalculation.breakdown.baseTokens} base`);
            }
            if (questBonus && questBonus > 0) {
              breakdownParts.push(`+ ${questBonus} quest bonus (each)`);
            }
            if (collab && collab.length > 0 && collabBonus > 0) {
              breakdownParts.push(`+ ${collabBonus} collab bonus (each)`);
            }
            if (boostTokenIncrease > 0) {
              breakdownParts.push(`+ ${boostTokenIncrease} boost`);
            }
            
            if (breakdownParts.length > 1 || boostTokenIncrease > 0) {
              tokenDisplay = `${breakdownParts.join(' ')} = ${finalTokenAmount} tokens`;
            }
            
            if (collab && collab.length > 0) {
              tokenDisplay += ` per person (${1 + collab.length} people)`;
            }

            // Build notification fields dynamically
            const notificationFields = [
              { name: '👤 Submitted by', value: `<@${interaction.user.id}>`, inline: false },
              { name: '📅 Submitted on', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
              { name: '📝 Title', value: title || 'Untitled', inline: false },
              { name: '💰 Token Amount', value: tokenDisplay, inline: false },
              { name: '🆔 Submission ID', value: `\`${submissionId}\``, inline: false },
              { name: '🔗 View Submission', value: `[Click Here](https://discord.com/channels/${interaction.guildId}/${submissionsChannel.id}/${sentMessage.id})`, inline: false }
            ];

            // Add collaboration field if present
            if (collab && collab.length > 0) {
              const collabDisplay = collab.join(', ');
              notificationFields.push({ name: '🤝 Collaboration', value: `Collaborating with ${collabDisplay}`, inline: false });
            }

            // Add quest/event fields if present
            if (questId && questId !== 'N/A') {
              notificationFields.push({ 
                name: '🎯 Quest/Event', 
                value: `\`${questId}\``, 
                inline: false 
              });
            }

            if (questBonus && questBonus > 0) {
              notificationFields.push({ 
                name: '🎁 Quest Bonus', 
                value: `+${questBonus} tokens`, 
                inline: false 
              });
            }

            // Add blight ID if provided
            if (blightId && blightId !== 'N/A') {
              notificationFields.push({ 
                name: '🩸 Blight Healing ID', 
                value: `\`${blightId}\``, 
                inline: false 
              });
            }

            // Add tagged characters if present
            if (taggedCharacters && taggedCharacters.length > 0) {
              const taggedDisplay = taggedCharacters.join(', ');
              notificationFields.push({ 
                name: '🏷️ Tagged Characters', 
                value: taggedDisplay, 
                inline: false 
              });
            }

            if (boostEffects.length > 0) {
              notificationFields.push({
                name: '🎭 Boost Effects',
                value: boostEffects.join('\n'),
                inline: false
              });
            }

            const notificationEmbed = new EmbedBuilder()
              .setColor('#FF6B35') // Orange for writing
              .setTitle('📝 PENDING WRITING SUBMISSION!')
              .setDescription('⏳ **Please approve within 24 hours!**')
              .addFields(notificationFields)
              .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
              .setFooter({ text: 'WRITING Submission Approval Required' })
              .setTimestamp();

            const notificationMessage = await approvalChannel.send({ embeds: [notificationEmbed] });
            console.log(`[submit.js]: ✅ Notification sent to approval channel for WRITING submission`);
            
            // Save the pending notification message ID to the submission data
            await updateSubmissionData(submissionId, {
              pendingNotificationMessageId: notificationMessage.id
            });
          }
        } catch (notificationError) {
          console.error(`[submit.js]: ❌ Failed to send notification to approval channel:`, notificationError);
          // Don't throw here, just log the error since the submission was already posted
        }
    
        // Send an ephemeral confirmation message
        await interaction.editReply({
          content: '📚 **Your writing submission has been successfully posted.**',
          ephemeral: true, // Ensure this is ephemeral
        });
      } catch (error) {
        handleInteractionError(error, 'submit.js');
        console.error('Error handling writing submission:', error);
        await interaction.editReply({
          content: '❌ **Error processing your submission. Please try again later.**',
          ephemeral: true, // Ensure error messages are ephemeral
        });
      }
    }

    // ------------------- Handle Art No-Tokens Submission -------------------
    if (subcommand === 'art-notokens') {
      try {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const user = interaction.user;
        const attachedFile = interaction.options.getAttachment('file');
        const title = interaction.options.getString('title')?.trim() || attachedFile.name;
        const taggedCharactersInput = interaction.options.getString('tagged_characters');

        // Parse and validate tagged characters
        let taggedCharacters = [];
        if (taggedCharactersInput) {
          const characterNames = taggedCharactersInput.split(',').map(name => name.trim()).filter(name => name.length > 0);
          
          if (characterNames.length === 0) {
            await interaction.editReply({ 
              content: '❌ **Invalid tagged characters format.** Please provide character names separated by commas.' 
            });
            return;
          }

          // Validate that all characters exist in the database
          const { fetchAllCharacters } = require('@/database/db');
          const allCharacters = await fetchAllCharacters();
          const characterNamesSet = new Set(allCharacters.map(char => char.name.toLowerCase()));
          
          const invalidCharacters = characterNames.filter(name => !characterNamesSet.has(name.toLowerCase()));
          if (invalidCharacters.length > 0) {
            await interaction.editReply({ 
              content: `❌ **Invalid character names:** ${invalidCharacters.join(', ')}. Please check that all character names are correct.` 
            });
            return;
          }

          taggedCharacters = characterNames;
        }

        // Check if a file is attached
        if (!attachedFile) {
          await interaction.editReply({ content: '❌ **No file attached. Please try again.**' });
          return;
        }

        const fileName = path.basename(attachedFile.name);
        const discordImageUrl = attachedFile.url;

        // Upload the image to Google Drive or cloud storage
        const googleImageUrl = await uploadSubmissionImage(discordImageUrl, fileName);

        // Post the embed publicly in the submissions channel first
        const submissionsChannel = interaction.client.channels.cache.get('940446392789389362');
        const embed = createArtSubmissionEmbed({
          submissionId: generateUniqueId('A'),
          title,
          fileName,
          category: 'art',
          userId: user.id,
          username: user.username,
          userAvatar: user.displayAvatarURL({ dynamic: true }),
          fileUrl: googleImageUrl,
          finalTokenAmount: 0,
          tokenCalculation: 'No tokens - Display only',
          baseSelections: [],
          baseCounts: new Map(),
          typeMultiplierSelections: [],
          typeMultiplierCounts: new Map(),
          productMultiplierValue: null,
          addOnsApplied: [],
          specialWorksApplied: [],
          collab: [],
          blightId: null,
          taggedCharacters: taggedCharacters,
          questEvent: 'N/A',
          questBonus: 'N/A'
        });
        const sentMessage = await submissionsChannel.send({ embeds: [embed] });

        // Create submission data for auto-approval with message URL
        const submissionId = generateUniqueId('A');
        const submissionData = {
          submissionId,
          title,
          fileName,
          category: 'art',
          userId: user.id,
          username: user.username,
          userAvatar: user.displayAvatarURL({ dynamic: true }),
          fileUrl: googleImageUrl,
          messageUrl: `https://discord.com/channels/${interaction.guildId}/${submissionsChannel.id}/${sentMessage.id}`,
          finalTokenAmount: 0, // No tokens
          tokenCalculation: 'No tokens - Display only',
          baseSelections: [],
          baseCounts: new Map(),
          typeMultiplierSelections: [],
          typeMultiplierCounts: new Map(),
          productMultiplierValue: null,
          addOnsApplied: [],
          specialWorksApplied: [],
          collab: [],
          blightId: null,
          taggedCharacters: taggedCharacters,
          questEvent: 'N/A',
          questBonus: 'N/A',
          approvedBy: 'System (No-Tokens)',
          approvedAt: new Date(),
          approvalMessageId: null,
          pendingNotificationMessageId: null,
          submittedAt: new Date()
        };

        // Save directly to approved submissions database
        const ApprovedSubmission = require('@/models/ApprovedSubmissionModel');
        const approvedSubmission = new ApprovedSubmission(submissionData);
        await approvedSubmission.save();

        await interaction.editReply({
          content: '🎨 **Your art submission has been posted for display (no tokens).**',
          ephemeral: true,
        });

      } catch (error) {
        handleInteractionError(error, 'submit.js');
        console.error('Error handling art notokens submission:', error);
        await interaction.editReply({ content: '❌ **Error processing your submission. Please try again later.**' });
      }
    }

    // ------------------- Handle Writing No-Tokens Submission -------------------
    if (subcommand === 'writing-notokens') {
      try {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const user = interaction.user;
        const title = interaction.options.getString('title')?.trim();
        const link = interaction.options.getString('link');
        const description = interaction.options.getString('description') || 'No description provided.';
        const taggedCharactersInput = interaction.options.getString('tagged_characters');

        // Parse and validate tagged characters
        let taggedCharacters = [];
        if (taggedCharactersInput) {
          const characterNames = taggedCharactersInput.split(',').map(name => name.trim()).filter(name => name.length > 0);
          
          if (characterNames.length === 0) {
            await interaction.editReply({ 
              content: '❌ **Invalid tagged characters format.** Please provide character names separated by commas.' 
            });
            return;
          }

          // Validate that all characters exist in the database
          const { fetchAllCharacters } = require('@/database/db');
          const allCharacters = await fetchAllCharacters();
          const characterNamesSet = new Set(allCharacters.map(char => char.name.toLowerCase()));
          
          const invalidCharacters = characterNames.filter(name => !characterNamesSet.has(name.toLowerCase()));
          if (invalidCharacters.length > 0) {
            await interaction.editReply({ 
              content: `❌ **Invalid character names:** ${invalidCharacters.join(', ')}. Please check that all character names are correct.` 
            });
            return;
          }

          taggedCharacters = characterNames;
        }

        // Post the embed publicly in the submissions channel first
        const submissionsChannel = interaction.client.channels.cache.get('940446392789389362');
        const embed = createWritingSubmissionEmbed({
          submissionId: generateUniqueId('W'),
          title,
          category: 'writing',
          userId: user.id,
          username: user.username,
          userAvatar: user.displayAvatarURL({ dynamic: true }),
          fileUrl: null,
          finalTokenAmount: 0,
          tokenCalculation: 'No tokens - Display only',
          wordCount: null,
          link,
          description,
          collab: [],
          blightId: null,
          taggedCharacters: taggedCharacters,
          questEvent: 'N/A',
          questBonus: 'N/A'
        });
        const sentMessage = await submissionsChannel.send({ embeds: [embed] });

        // Create submission data for auto-approval with message URL
        const submissionId = generateUniqueId('W');
        const submissionData = {
          submissionId,
          title,
          category: 'writing',
          userId: user.id,
          username: user.username,
          userAvatar: user.displayAvatarURL({ dynamic: true }),
          fileUrl: null,
          messageUrl: `https://discord.com/channels/${interaction.guildId}/${submissionsChannel.id}/${sentMessage.id}`,
          finalTokenAmount: 0, // No tokens
          tokenCalculation: 'No tokens - Display only',
          wordCount: null,
          link,
          description,
          collab: [],
          blightId: null,
          taggedCharacters: taggedCharacters,
          questEvent: 'N/A',
          questBonus: 'N/A',
          approvedBy: 'System (No-Tokens)',
          approvedAt: new Date(),
          approvalMessageId: null,
          pendingNotificationMessageId: null,
          submittedAt: new Date()
        };

        // Save directly to approved submissions database
        const ApprovedSubmission = require('@/models/ApprovedSubmissionModel');
        const approvedSubmission = new ApprovedSubmission(submissionData);
        await approvedSubmission.save();

        await interaction.editReply({
          content: '📚 **Your writing submission has been posted for display (no tokens).**',
          ephemeral: true,
        });

      } catch (error) {
        handleInteractionError(error, 'submit.js');
        console.error('Error handling writing notokens submission:', error);
        await interaction.editReply({ content: '❌ **Error processing your submission. Please try again later.**' });
      }
    }
    
  },
  // ------------------- Autocomplete Handler -------------------
  // Handles autocomplete for the submit command options
  async onAutocomplete(interaction) {
    try {
      const { handleAutocomplete } = require('../../handlers/autocompleteHandler.js');
      await handleAutocomplete(interaction);
    } catch (error) {
      handleInteractionError(error, 'submit.js');
      console.error('Error handling autocomplete:', error);
      await interaction.respond([]);
    }
  },

  // ------------------- Interaction Handling -------------------
  // Handles interactions during the submission process (dropdowns, buttons, modals).
  async interactionCreate(interaction) {
    try {
      if (interaction.isAutocomplete()) {
        await this.onAutocomplete(interaction); // Handle autocomplete
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmission(interaction);
      }
    } catch (error) {
      handleInteractionError(error, 'submit.js');
      console.error('Error handling interaction:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.followUp({
          content: '⚠️ **Error handling your request. Please try again.**',
          ephemeral: true,
        });
      }
    }
  },
};
