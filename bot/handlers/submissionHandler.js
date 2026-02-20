// ------------------- submissionHandler.js -------------------
// This module handles finalizing the submission, uploading images, sending confirmation,
// updating token counts, and canceling the submission process.

// ============================================================================
// Discord.js Components
// ============================================================================

const { EmbedBuilder } = require('discord.js');

const { handleError } = require('@/utils/globalErrorHandler');
const { createArtSubmissionEmbed, createWritingSubmissionEmbed, updateBoostRequestEmbed } = require('../embeds/embeds.js');
// ============================================================================
// Database Services
// ============================================================================

const {
  appendEarnedTokens,
  updateTokenBalance,
  fetchCharacterByNameAndUserId,
  fetchModCharacterByNameAndUserId,
  fetchCharacterByName,
  fetchModCharacterByName,
  fetchCharactersByUserId,
  fetchModCharactersByUserId
} = require('@/database/db');

// ============================================================================
// Utility Functions
// ============================================================================

const { resetSubmissionState, calculateTokens } = require('@/utils/tokenUtils');
// Storage utilities
const { 
  saveSubmissionToStorage, 
  updateSubmissionData, 
  retrieveSubmissionFromStorage, 
  deleteSubmissionFromStorage,
  findLatestSubmissionIdForUser 
} = require('@/utils/storage');
const { applyTeacherTokensBoost, applyScholarTokensBoost } = require('../modules/boostingModule');
const { 
  retrieveBoostingRequestFromTempDataByCharacter,
  saveBoostingRequestToTempData,
  updateBoostAppliedMessage
} = require('../commands/jobs/boosting');

async function resolveTaggedCharacter(characterName, userId = null) {
  if (!characterName || typeof characterName !== 'string') {
    return null;
  }

  const trimmedName = characterName.trim();
  let character = null;

  if (userId) {
    try {
      character = await fetchCharacterByNameAndUserId(trimmedName, userId);
    } catch (error) {
      console.error(`[submissionHandler.js]: ❌ Error fetching character ${trimmedName} by user ${userId}:`, error);
    }

    if (!character) {
      try {
        character = await fetchModCharacterByNameAndUserId(trimmedName, userId);
      } catch (modError) {
        console.error(`[submissionHandler.js]: ❌ Error fetching mod character ${trimmedName} by user ${userId}:`, modError);
      }
    }
  }

  if (!character) {
    try {
      character = await fetchCharacterByName(trimmedName);
    } catch (fallbackError) {
      console.error(`[submissionHandler.js]: ❌ Error fetching character ${trimmedName}:`, fallbackError);
    }
  }

  if (!character) {
    try {
      character = await fetchModCharacterByName(trimmedName);
    } catch (modFallbackError) {
      console.error(`[submissionHandler.js]: ❌ Error fetching mod character ${trimmedName}:`, modFallbackError);
    }
  }

  return character;
}


// ============================================================================
// Submission Completion Handler
// ============================================================================

// ------------------- Handle Submission Completion -------------------
// Finalizes the submission by retrieving submission data, recalculating tokens, 
// sending a confirmation message to the user, saving updated submission data, and resetting in-memory state.
async function handleSubmissionCompletion(interaction) {
  try {
    console.log(`[submissionHandler.js]: 🔄 Starting submission completion for user: ${interaction.user.id}`);
    // Get submission ID from the embed
    const messageEmbed = interaction.message.embeds[0];
    console.log(`[submissionHandler.js]: 📝 Embed fields:`, messageEmbed?.fields?.map(f => `${f.name}: ${f.value}`));
    
    const submissionId = messageEmbed?.fields?.find(field => field.name === 'Submission ID')?.value;
    console.log(`[submissionHandler.js]: 🔑 Found submission ID in embed: ${submissionId}`);
    
    if (!submissionId) {
      console.error(`[submissionHandler.js]: ❌ No submission ID found in embed`);
      await interaction.reply({
        content: '❌ **Submission ID not found. Please restart the submission process.**',
        ephemeral: true,
      });
      return;
    }

    // Retrieve submission data from storage using submissionId
    console.log(`[submissionHandler.js]: 🔍 Attempting to retrieve submission data for ID: ${submissionId}`);
    const submissionData = await retrieveSubmissionFromStorage(submissionId);
    console.log(`[submissionHandler.js]: 📊 Retrieved submission data:`, submissionData ? 'Found' : 'Not found');

    if (!submissionData) {
      console.error(`[submissionHandler.js]: ❌ No submission data found for ID: ${submissionId}`);
      // Try to find the latest submission for this user as a fallback
      const userId = interaction.user.id;
      console.log(`[submissionHandler.js]: 🔄 Attempting fallback lookup for user: ${userId}`);
      
      const latestSubmissionId = await findLatestSubmissionIdForUser(userId);
      console.log(`[submissionHandler.js]: 🔑 Found latest submission ID: ${latestSubmissionId}`);
      
      if (latestSubmissionId) {
        const latestSubmission = await retrieveSubmissionFromStorage(latestSubmissionId);
        console.log(`[submissionHandler.js]: 📊 Retrieved latest submission data:`, latestSubmission ? 'Found' : 'Not found');
        
        if (latestSubmission) {
          console.log(`[submissionHandler.js]: ✅ Found fallback submission ${latestSubmissionId}`);
          return await handleSubmissionCompletion(interaction, latestSubmission);
        }
      }
      
      console.error(`[submissionHandler.js]: ❌ No fallback submission found for user: ${userId}`);
      await interaction.reply({
        content: '❌ **Submission data not found. Please restart the submission process.**',
        ephemeral: true,
      });
      return;
    }

    console.log(`[submissionHandler.js]: 📝 Processing submission data for ID: ${submissionId}`);
    const { fileUrl, fileName, baseSelections, typeMultiplierSelections, productMultiplierValue, addOnsApplied, characterCount } = submissionData;
    const user = interaction.user;

    if (!fileUrl || !fileName) {
      console.error(`[submissionHandler.js]: ❌ Missing required fields - fileUrl: ${!!fileUrl}, fileName: ${!!fileName}`);
      throw new Error('File URL or File Name missing.');
    }

    // Validate required selections
    if (!productMultiplierValue) {
      throw new Error('Product multiplier is required. Please select a product multiplier before submitting.');
    }
    
    // Calculate final token amount
    console.log(`[submissionHandler.js]: 🧮 Calculating tokens for submission:`, {
      baseSelections,
      baseCounts: Object.fromEntries(submissionData.baseCounts || new Map()),
      typeMultiplierSelections,
      productMultiplierValue,
      addOnsApplied
    });
    
    // Get quest bonus and collab bonus if quest is linked (not for group memes)
    let questBonus = 0;
    let collabBonus = 0;
    const isGroupMeme = submissionData.isGroupMeme === true;
    if (!isGroupMeme && submissionData.questEvent && submissionData.questEvent !== 'N/A') {
      const { getQuestBonus, getCollabBonus } = require('@/utils/tokenUtils');
      const userId = submissionData.userId || interaction.user.id;
      questBonus = await getQuestBonus(submissionData.questEvent, userId);
      collabBonus = await getCollabBonus(submissionData.questEvent);
      console.log(`[submissionHandler.js]: 🎯 Quest bonus for ${submissionData.questEvent}: ${questBonus}`);
      console.log(`[submissionHandler.js]: 🤝 Collab bonus for ${submissionData.questEvent}: ${collabBonus}`);
      
      // Update submission data with the actual quest bonus (convert to string for storage)
      submissionData.questBonus = String(questBonus);
    }

    const { tokensPerPerson, breakdown } = calculateTokens({
      baseSelections,
      baseCounts: submissionData.baseCounts || new Map(),
      typeMultiplierSelections,
      productMultiplierValue,
      addOnsApplied,
      typeMultiplierCounts: submissionData.typeMultiplierCounts || {},
      specialWorksApplied: submissionData.specialWorksApplied || [],
      collab: submissionData.collab,
      questBonus,
      collabBonus,
      groupMemeBonus: isGroupMeme
    });
    console.log(`[submissionHandler.js]: 💰 Calculated tokens per person: ${tokensPerPerson}`);
    console.log(`[submissionHandler.js]: 📊 Token breakdown:`, breakdown);

    let finalTokenAmount = tokensPerPerson;
    const totalTokens = tokensPerPerson; // Base tokens before boosts
    const boostEffects = Array.isArray(submissionData.boostEffects) ? [...submissionData.boostEffects] : [];
    const boostFulfillmentMap = new Map();
    const boostMetadataMap = new Map();
    
    const taggedCharacters = Array.isArray(submissionData.taggedCharacters)
      ? submissionData.taggedCharacters
      : [];

    const focusCharacterMap = new Map();

    if (taggedCharacters.length > 0) {
      for (const taggedName of taggedCharacters) {
        if (!taggedName) continue;
        const normalizedName = taggedName.trim().toLowerCase();
        if (focusCharacterMap.has(normalizedName)) continue;

        const character = await resolveTaggedCharacter(taggedName, submissionData.userId);
        if (character) {
          focusCharacterMap.set(normalizedName, character);
        }
      }
    }

    const focusCharacters = Array.from(focusCharacterMap.values());
    const processedBoostTypes = new Set();

    for (const character of focusCharacters) {
      if (!character) continue;

      // Check character.boostedBy first, but also check TempData if it's null
      let boosterName = character.boostedBy;
      if (!boosterName) {
        // Check TempData for active boosts - this will also self-repair boostedBy if needed
        const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(character.name);
        if (activeBoost && activeBoost.status === 'accepted' && activeBoost.category === 'Tokens') {
          boosterName = activeBoost.boostingCharacter;
          // Ensure boostedBy is saved to the database
          if (boosterName) {
            character.boostedBy = boosterName;
            await character.save();
            console.log(`[submissionHandler.js]: ✅ Restored boostedBy for ${character.name} from TempData (boosted by ${boosterName})`);
          }
        }
      }

      if (!boosterName) continue;

      const boosterChar = await resolveTaggedCharacter(boosterName);
      if (!boosterChar) {
        console.warn(`[submissionHandler.js]: ⚠️ Booster ${boosterName} not found for ${character.name}`);
        continue;
      }

      if (
        submissionData.category === 'art' &&
        boosterChar.job === 'Teacher' &&
        !processedBoostTypes.has('teacher_tokens')
      ) {
        const teacherEffectAlreadyLogged = boostEffects.some(effect =>
          effect.includes('Critique & Composition')
        );

        const boostedTokens = applyTeacherTokensBoost(finalTokenAmount);
        const tokenIncrease = boostedTokens - finalTokenAmount;
        if (tokenIncrease > 0) {
          finalTokenAmount = boostedTokens;
          if (!teacherEffectAlreadyLogged) {
            boostEffects.push(`👩‍🏫 **Critique & Composition:** ${boosterChar.name} added 🪙 ${tokenIncrease}.`);
          }
          processedBoostTypes.add('teacher_tokens');
          boostFulfillmentMap.set(character.name.toLowerCase(), character);
          const metadataKey = `${boosterChar.job.toLowerCase()}_${boosterChar.name.toLowerCase()}`;
          if (!boostMetadataMap.has(metadataKey)) {
            boostMetadataMap.set(metadataKey, {
              boostType: 'teacher_tokens',
              boosterJob: boosterChar.job,
              boosterName: boosterChar.name,
              targets: new Set(),
              tokenIncrease: 0
            });
          }
          const metadataRecord = boostMetadataMap.get(metadataKey);
          metadataRecord.targets.add(character.name);
          metadataRecord.tokenIncrease += tokenIncrease;
          console.log(`[submissionHandler.js]: 📖 Teacher boost - Critique & Composition (+${tokenIncrease} tokens)`);
        }
      }

      if (
        submissionData.category === 'writing' &&
        boosterChar.job === 'Scholar' &&
        !processedBoostTypes.has('scholar_tokens')
      ) {
        const scholarEffectAlreadyLogged = boostEffects.some(effect =>
          effect.includes('Research Stipend')
        );

        const boostedTokens = applyScholarTokensBoost(finalTokenAmount);
        const tokenIncrease = boostedTokens - finalTokenAmount;
        if (tokenIncrease > 0) {
          finalTokenAmount = boostedTokens;
          if (!scholarEffectAlreadyLogged) {
            boostEffects.push(`📚 **Research Stipend:** ${boosterChar.name} added 🪙 ${tokenIncrease}.`);
          }
          processedBoostTypes.add('scholar_tokens');
          boostFulfillmentMap.set(character.name.toLowerCase(), character);
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
          console.log(`[submissionHandler.js]: 📚 Scholar boost - Research Stipend (+${tokenIncrease} tokens)`);
        }
      }
    }

    // Check user's characters for boosts (in case they didn't tag themselves)
    if (submissionData.userId) {
      try {
        const userCharacters = await fetchCharactersByUserId(submissionData.userId);
        const userModCharacters = await fetchModCharactersByUserId(submissionData.userId);
        const allUserCharacters = [...userCharacters, ...userModCharacters];

        for (const character of allUserCharacters) {
          if (!character) continue;

          // Skip if this character was already checked in tagged characters
          const normalizedName = character.name.toLowerCase();
          if (focusCharacterMap.has(normalizedName)) continue;

          // Check character.boostedBy first, but also check TempData if it's null
          let boosterName = character.boostedBy;
          if (!boosterName) {
            // Check TempData for active boosts - this will also self-repair boostedBy if needed
            const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(character.name);
            if (activeBoost && activeBoost.status === 'accepted' && activeBoost.category === 'Tokens') {
              boosterName = activeBoost.boostingCharacter;
              // Ensure boostedBy is saved to the database
              if (boosterName) {
                character.boostedBy = boosterName;
                await character.save();
                console.log(`[submissionHandler.js]: ✅ Restored boostedBy for ${character.name} from TempData (boosted by ${boosterName})`);
              }
            }
          }

          if (!boosterName) continue;

          const boosterChar = await resolveTaggedCharacter(boosterName);
          if (!boosterChar) {
            console.warn(`[submissionHandler.js]: ⚠️ Booster ${boosterName} not found for ${character.name}`);
            continue;
          }

          if (
            submissionData.category === 'art' &&
            boosterChar.job === 'Teacher' &&
            !processedBoostTypes.has('teacher_tokens')
          ) {
            const teacherEffectAlreadyLogged = boostEffects.some(effect =>
              effect.includes('Critique & Composition')
            );

            const boostedTokens = applyTeacherTokensBoost(finalTokenAmount);
            const tokenIncrease = boostedTokens - finalTokenAmount;
            if (tokenIncrease > 0) {
              finalTokenAmount = boostedTokens;
              if (!teacherEffectAlreadyLogged) {
                boostEffects.push(`👩‍🏫 **Critique & Composition:** ${boosterChar.name} added 🪙 ${tokenIncrease}.`);
              }
              processedBoostTypes.add('teacher_tokens');
              boostFulfillmentMap.set(character.name.toLowerCase(), character);
              const metadataKey = `${boosterChar.job.toLowerCase()}_${boosterChar.name.toLowerCase()}`;
              if (!boostMetadataMap.has(metadataKey)) {
                boostMetadataMap.set(metadataKey, {
                  boostType: 'teacher_tokens',
                  boosterJob: boosterChar.job,
                  boosterName: boosterChar.name,
                  targets: new Set(),
                  tokenIncrease: 0
                });
              }
              const metadataRecord = boostMetadataMap.get(metadataKey);
              metadataRecord.targets.add(character.name);
              metadataRecord.tokenIncrease += tokenIncrease;
              console.log(`[submissionHandler.js]: 📖 Teacher boost - Critique & Composition (+${tokenIncrease} tokens) from user character ${character.name}`);
            }
          }

          if (
            submissionData.category === 'writing' &&
            boosterChar.job === 'Scholar' &&
            !processedBoostTypes.has('scholar_tokens')
          ) {
            const scholarEffectAlreadyLogged = boostEffects.some(effect =>
              effect.includes('Research Stipend')
            );

            const boostedTokens = applyScholarTokensBoost(finalTokenAmount);
            const tokenIncrease = boostedTokens - finalTokenAmount;
            if (tokenIncrease > 0) {
              finalTokenAmount = boostedTokens;
              if (!scholarEffectAlreadyLogged) {
                boostEffects.push(`📚 **Research Stipend:** ${boosterChar.name} added 🪙 ${tokenIncrease}.`);
              }
              processedBoostTypes.add('scholar_tokens');
              boostFulfillmentMap.set(character.name.toLowerCase(), character);
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
              console.log(`[submissionHandler.js]: 📚 Scholar boost - Research Stipend (+${tokenIncrease} tokens) from user character ${character.name}`);
            }
          }
        }
      } catch (error) {
        console.error(`[submissionHandler.js]: ❌ Error checking user characters for boosts:`, error);
        // Don't fail the submission if boost check fails
      }
    }

    // Update submission data with final calculations
    const boostTokenIncrease = Math.max(0, finalTokenAmount - totalTokens);
    const boostMetadata = Array.from(boostMetadataMap.values()).map(entry => ({
      boostType: entry.boostType,
      boosterJob: entry.boosterJob,
      boosterName: entry.boosterName,
      targets: Array.from(entry.targets),
      tokenIncrease: entry.tokenIncrease
    }));

    submissionData.finalTokenAmount = finalTokenAmount;
    submissionData.tokenCalculation = breakdown;
    submissionData.updatedAt = new Date();
    if (boostEffects.length > 0) {
      submissionData.boostEffects = boostEffects;
    }
    if (boostTokenIncrease > 0) {
      submissionData.boostTokenIncrease = boostTokenIncrease;
    }
    if (boostMetadata.length > 0) {
      submissionData.boostMetadata = boostMetadata;
    } else {
      delete submissionData.boostMetadata;
    }

    // Clear Tokens boost immediately so it only applies to this submission (no race with other submissions)
    for (const character of boostFulfillmentMap.values()) {
      await fulfillTokenBoost(character, interaction.client);
    }

    // Save updated submission data using submissionId
    console.log(`[submissionHandler.js]: 💾 Saving final submission data for ID: ${submissionId}`);
    await saveSubmissionToStorage(submissionId, submissionData);
    console.log(`[submissionHandler.js]: ✅ Final submission data saved`);

    // Create and send the embed
    console.log(`[submissionHandler.js]: 🎨 Creating submission embed`);
    const embed = submissionData.category === 'writing'
      ? createWritingSubmissionEmbed(submissionData)
      : createArtSubmissionEmbed(submissionData);
    const sentMessage = await interaction.reply({ embeds: [embed] });
    console.log(`[submissionHandler.js]: ✅ Submission embed sent`);

    // Update submission data with message URL
    submissionData.messageUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${sentMessage.id}`;
    await saveSubmissionToStorage(submissionId, submissionData);

    // Link submission to quest if quest ID is provided
    if (submissionData.questEvent && submissionData.questEvent !== 'N/A') {
      try {
        const Quest = require('@/models/QuestModel');
        const quest = await Quest.findOne({ questID: submissionData.questEvent });
        
        if (quest && (quest.questType === 'Art' || quest.questType === 'Writing') && quest.status === 'active') {
          const linkResult = await quest.linkSubmission(interaction.user.id, submissionData);
          
          if (linkResult.success) {
            console.log(`[submissionHandler.js] ✅ Submission linked to quest ${submissionData.questEvent}`);
          } else {
            console.log(`[submissionHandler.js] ℹ️ Could not link submission to quest: ${linkResult.reason || linkResult.error}`);
          }
        }
      } catch (questError) {
        console.error(`[submissionHandler.js] ❌ Error linking submission to quest:`, questError);
        // Don't fail the submission if quest linking fails
      }
    }

    // Send notification to approval channel
    try {
      const approvalChannel = interaction.client.channels.cache.get('1381479893090566144');
      if (approvalChannel?.isTextBased()) {
        // Determine submission type based on available data
        const isWriting = submissionData.category === 'writing' || (!submissionData.fileName && !submissionData.fileUrl);
        const submissionType = isWriting ? 'WRITING' : 'ART';
        const typeEmoji = isWriting ? '📝' : '🎨';
        const typeColor = isWriting ? '#FF6B35' : '#FF0000'; // Orange for writing, red for art
        
        // Calculate token display based on collaboration and quest bonus
        let tokenDisplay = `${finalTokenAmount} tokens`;
        const hasCollaborators = submissionData.collab && ((Array.isArray(submissionData.collab) && submissionData.collab.length > 0) || (typeof submissionData.collab === 'string' && submissionData.collab !== 'N/A'));
        
        // Add quest bonus breakdown if present
        if (submissionData.questBonus && submissionData.questBonus !== 'N/A' && submissionData.questBonus > 0) {
          const baseTokens = totalTokens - submissionData.questBonus;
          if (boostTokenIncrease > 0) {
            tokenDisplay = `${baseTokens} + ${submissionData.questBonus} quest bonus + ${boostTokenIncrease} boost = ${finalTokenAmount} tokens`;
          } else {
            tokenDisplay = `${baseTokens} + ${submissionData.questBonus} quest bonus = ${finalTokenAmount} tokens`;
          }
        } else if (boostTokenIncrease > 0) {
          tokenDisplay = `${totalTokens} + ${boostTokenIncrease} boost = ${finalTokenAmount} tokens`;
        }
        
        if (hasCollaborators) {
          const collaborators = Array.isArray(submissionData.collab) ? submissionData.collab : [submissionData.collab];
          const totalParticipants = 1 + collaborators.length;
          const splitTokens = Math.floor(finalTokenAmount / totalParticipants);
          tokenDisplay += ` (${splitTokens} each)`;
        }

        // Build notification fields dynamically
        const notificationFields = [
          { name: '👤 Submitted by', value: `<@${interaction.user.id}>`, inline: false },
          { name: '📅 Submitted on', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
          { name: `${typeEmoji} Title`, value: submissionData.title || submissionData.fileName || 'Untitled', inline: false },
          { name: '💰 Token Amount', value: tokenDisplay, inline: false },
          { name: '🆔 Submission ID', value: `\`${submissionId}\``, inline: false },
          { name: '🔗 View Submission', value: `[Click Here](${submissionData.messageUrl})`, inline: false }
        ];

        // Add collaboration field if present
        if (hasCollaborators) {
          const collaborators = Array.isArray(submissionData.collab) ? submissionData.collab : [submissionData.collab];
          const collabDisplay = collaborators.join(', ');
          notificationFields.push({ name: '🤝 Collaboration', value: `Collaborating with ${collabDisplay}`, inline: false });
        }

        // Add quest/event fields if present
        if (submissionData.questEvent && submissionData.questEvent !== 'N/A') {
          notificationFields.push({ 
            name: '🎯 Quest/Event', 
            value: `\`${submissionData.questEvent}\``, 
            inline: false 
          });
        }

        if (submissionData.questBonus && submissionData.questBonus !== 'N/A' && submissionData.questBonus > 0) {
          notificationFields.push({ 
            name: '🎁 Quest Bonus', 
            value: `+${submissionData.questBonus} tokens`, 
            inline: false 
          });
        }

        // Add blight ID if provided
        if (submissionData.blightId && submissionData.blightId !== 'N/A') {
          notificationFields.push({ 
            name: '🩸 Blight Healing ID', 
            value: `\`${submissionData.blightId}\``, 
            inline: false 
          });
        }

        if (submissionData.taggedCharacters && submissionData.taggedCharacters.length > 0) {
          const taggedDisplay = submissionData.taggedCharacters.join(', ');
          notificationFields.push({
            name: '🏷️ Tagged Characters',
            value: taggedDisplay,
            inline: false
          });
        }

        if (submissionData.boostEffects && submissionData.boostEffects.length > 0) {
          notificationFields.push({
            name: '🎭 Boost Effects',
            value: submissionData.boostEffects.join('\n'),
            inline: false
          });
        }

        const notificationEmbed = new EmbedBuilder()
          .setColor(typeColor)
          .setTitle(`${typeEmoji} PENDING ${submissionType} SUBMISSION!`)
          .setDescription('⏳ **Please approve within 24 hours!**')
          .addFields(notificationFields)
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: `${submissionType} Submission Approval Required` })
          .setTimestamp();

        const notificationMessage = await approvalChannel.send({ embeds: [notificationEmbed] });
        console.log(`[submissionHandler.js]: ✅ Notification sent to approval channel for ${submissionType} submission`);
        
        // Save the pending notification message ID to the submission data
        submissionData.pendingNotificationMessageId = notificationMessage.id;
        await saveSubmissionToStorage(submissionId, submissionData);
      }
    } catch (notificationError) {
      console.error(`[submissionHandler.js]: ❌ Failed to send notification to approval channel:`, notificationError);
      // Don't throw here, just log the error since the submission was already posted
    }

    // Update token count in database and log to Google Sheets
    console.log(`[submissionHandler.js]: 💰 Updating token count for user: ${user.id}`);
    
    // Determine submission category and title
    const submissionCategory = submissionData.category || 'art';
    const submissionTitle = submissionData.title || fileName;
    const submissionUrl = submissionData.fileUrl || fileUrl;
    
    await updateTokenBalance(user.id, finalTokenAmount, {
      category: 'submission',
      description: submissionTitle,
      link: submissionUrl
    });
    console.log(`[submissionHandler.js]: ✅ Token count updated`);

    // Clean up storage
    console.log(`[submissionHandler.js]: 🧹 Cleaning up submission data for ID: ${submissionId}`);
    await deleteSubmissionFromStorage(submissionId);
    console.log(`[submissionHandler.js]: ✅ Submission data cleaned up`);

  } catch (error) {
    handleError(error, 'submissionHandler.js');
    console.error(`[submissionHandler.js]: ❌ Error in handleSubmissionCompletion:`, error);
    console.error(`[submissionHandler.js]: 📝 Error details:`, {
      message: error.message,
      stack: error.stack,
      interaction: {
        userId: interaction.user.id,
        messageId: interaction.message?.id,
        customId: interaction.customId
      }
    });
    
    if (!interaction.replied) {
      await interaction.reply({
        content: '❌ **An error occurred while processing your submission.**',
        ephemeral: true
      });
    }
  }
}

// ============================================================================
// Submission Cancellation Handler
// ============================================================================

// ------------------- Handle Cancel Submission -------------------
// Cancels the submission process, removes persistent data if applicable, 
// resets the in-memory submission state, and notifies the user.
async function handleCancelSubmission(interaction) {
  try {
    // Get submission ID from the embed
    const submissionId = interaction.message.embeds[0]?.fields?.find(field => field.name === 'Submission ID')?.value;
    
    if (!submissionId) {
      console.error(`[submissionHandler.js]: handleCancelSubmission: No submission ID found in embed`);
      await interaction.reply({
        content: '❌ **Submission ID not found. Please restart the submission process.**',
        ephemeral: true,
      });
      return;
    }

    // Delete submission from storage using submissionId
    await deleteSubmissionFromStorage(submissionId);

    // Notify the user about cancellation
    await interaction.update({
      content: '🚫 **Submission canceled.** Please restart the process if you wish to submit again.',
      components: [], // Remove all action components
    });
  } catch (error) {
    handleError(error, 'submissionHandler.js');
    console.error(`[submissionHandler.js]: handleCancelSubmission: ${error.message}`);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: '❌ **An error occurred while canceling your submission.**',
        ephemeral: true
      });
    }
  }
}

// ============================================================================
// Submit Action Handler
// ============================================================================

// ------------------- Handle Submit Action -------------------
// Processes the user's submit action by checking the customId of the interaction.
// For confirmation, it finalizes the submission and updates token data;
// for cancellation, it aborts the process.
async function handleSubmitAction(interaction) {
  const customId = interaction.customId;

  if (customId === 'confirm') {
    await handleSubmissionCompletion(interaction);

    const submissionId = interaction.message.embeds[0]?.fields?.find(field => field.name === 'Submission ID')?.value;

    if (!submissionId) {
      console.error(`[submissionHandler.js]: handleSubmitAction: Submission ID is undefined.`);
      if (!interaction.replied) {
        return interaction.reply({
          content: '⚠️ **Submission ID not found.**',
          ephemeral: true,
        });
      }
      return; // Exit if no submission ID is found
    }

    const submission = await retrieveSubmissionFromStorage(submissionId);

    if (!submission) {
      if (!interaction.replied) {
        return interaction.reply({
          content: `⚠️ **Submission with ID \`${submissionId}\` not found.**`,
          ephemeral: true,
        });
      }
      return; // Exit if no submission is found
    }

    const user = interaction.user;

    try {
      // ------------------- Update Token Data -------------------
      // Determine submission category and title
      const submissionCategory = submission.category || 'art';
      const submissionTitle = submission.title || submission.fileName;
      const submissionUrl = submission.fileUrl;
      
      // Prefer finalTokenAmount (includes boost e.g. Research Stipend); fall back to tokenCalculation
      const tokensPerPerson = submission.finalTokenAmount ?? 
        (submission.tokenCalculation && typeof submission.tokenCalculation === 'object'
          ? (submission.tokenCalculation.tokensPerPerson ?? submission.tokenCalculation.finalTotal)
          : null) ?? 0;
      
      // If a collaboration exists, give each person their tokensPerPerson amount
      if (submission.collab && ((Array.isArray(submission.collab) && submission.collab.length > 0) || typeof submission.collab === 'string')) {
        // Handle both array and legacy string format
        const collaborators = Array.isArray(submission.collab) ? submission.collab : [submission.collab];
        
        // Each person gets tokensPerPerson (not split - bonuses are already included)
        // Update tokens for the main user
        await updateTokenBalance(user.id, tokensPerPerson, {
          category: 'submission',
          description: submissionTitle,
          link: submissionUrl
        });
        
        // Update tokens for each collaborator
        for (const collaboratorMention of collaborators) {
          const collaboratorId = collaboratorMention.replace(/[<@>]/g, '');
          await updateTokenBalance(collaboratorId, tokensPerPerson, {
            category: 'submission',
            description: submissionTitle,
            link: submissionUrl
          });
        }
      } else {
        // No collaboration; assign all tokens to the main user.
        await updateTokenBalance(user.id, tokensPerPerson, {
          category: 'submission',
          description: submissionTitle,
          link: submissionUrl
        });
      }
    } catch (error) {
      handleError(error, 'submissionHandler.js');
      console.error(`[submissionHandler.js]: handleSubmitAction: Error appending token data for submission ${submissionId}: ${error.message}`);
    }

    if (!interaction.replied) {
      await interaction.editReply({
        content: '✅ **Submission has been confirmed and approved.** Your tokens have been updated!',
        components: [],
      });
    }
  } else if (customId === 'cancel') {
    await handleCancelSubmission(interaction);
  } else {
    if (!interaction.replied) {
      await interaction.reply({ content: '⚠️ **Unknown action!**', ephemeral: true });
    }
  }
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
    console.warn(`[submissionHandler.js]: ⚠️ Unable to resolve character document for ${characterName} when clearing boost.`);
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
          console.error(`[submissionHandler.js]: ❌ Failed to update boost embeds for ${characterName}:`, embedError);
        }
      }
    }
  } catch (error) {
    console.error(`[submissionHandler.js]: ❌ Failed to mark token boost fulfilled for ${characterName}:`, error);
  }

  try {
    if (characterDoc.boostedBy) {
      characterDoc.boostedBy = null;
      await characterDoc.save();
    }
  } catch (saveError) {
    console.error(`[submissionHandler.js]: ❌ Failed to clear boost for ${characterName}:`, saveError);
  }
}

// ============================================================================
// Exported Handlers
// ============================================================================

// ------------------- Exported Functions -------------------
// Exports the submission action handlers for use in other parts of the application.
module.exports = { handleSubmitAction, handleSubmissionCompletion, handleCancelSubmission };
