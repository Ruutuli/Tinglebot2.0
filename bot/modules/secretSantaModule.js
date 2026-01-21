// ============================================================================
// ------------------- Secret Santa Module -------------------
// Core logic for Roots-themed Secret Santa art gift exchange
// ============================================================================

const { connectToTinglebot } = require('@app/shared/database/db');
const {
  SecretSantaParticipant,
  SecretSantaMatch,
  TempSignupData,
  SecretSantaSettings
} = require('@app/shared/models/SecretSantaModel');
const logger = require('@app/shared/utils/logger');

// ============================================================================
// ------------------- Storage Utilities -------------------
// ============================================================================

// ------------------- Function: loadSecretSantaData -------------------
async function loadSecretSantaData() {
  await connectToTinglebot();
  
  const participants = await SecretSantaParticipant.find().lean();
  const matches = await SecretSantaMatch.find().lean();
  const settings = await SecretSantaSettings.getSettings();
  
  return {
    participants,
    matches,
    settings
  };
}

// ------------------- Function: saveParticipant -------------------
async function saveParticipant(participantData) {
  await connectToTinglebot();
  
  const participant = await SecretSantaParticipant.findOneAndUpdate(
    { userId: participantData.userId },
    participantData,
    { new: true, upsert: true }
  );
  
  return participant;
}

// ------------------- Function: getParticipant -------------------
async function getParticipant(userId) {
  await connectToTinglebot();
  return await SecretSantaParticipant.findOne({ userId }).lean();
}

// ------------------- Function: removeParticipant -------------------
async function removeParticipant(userId) {
  await connectToTinglebot();
  
  // Remove participant and their matches
  await SecretSantaParticipant.deleteOne({ userId });
  await SecretSantaMatch.deleteMany({ 
    $or: [{ santaId: userId }, { gifteeId: userId }] 
  });
  
  return true;
}

// ------------------- Function: savePendingMatches -------------------
async function savePendingMatches(matches) {
  await connectToTinglebot();
  
  // Delete existing pending matches
  await SecretSantaMatch.deleteMany({ isPending: true });
  
  // Save new pending matches
  const matchDocs = matches.map(match => ({
    santaId: match.santaId,
    gifteeId: match.gifteeId,
    matchedAt: new Date(match.matchedAt || Date.now()),
    isPending: true
  }));
  
  await SecretSantaMatch.insertMany(matchDocs);
  return true;
}

// ------------------- Function: approveMatches -------------------
async function approveMatches() {
  await connectToTinglebot();
  
  // Convert pending matches to approved
  await SecretSantaMatch.updateMany(
    { isPending: true },
    { $set: { isPending: false } }
  );
  
  // Update participant records
  const matches = await SecretSantaMatch.find({ isPending: false }).lean();
  for (const match of matches) {
    await SecretSantaParticipant.updateOne(
      { userId: match.santaId },
      { 
        $set: { 
          matchedWith: match.gifteeId,
          receivedAssignment: false 
        } 
      }
    );
  }
  
  // Update settings
  const settings = await SecretSantaSettings.getSettings();
  settings.matched = true;
  settings.matchedAt = new Date();
  settings.matchesApproved = true;
  settings.signupsOpen = false; // Close signups after matches are approved
  await settings.save();
  
  return true;
}

// ------------------- Function: getPendingMatches -------------------
async function getPendingMatches() {
  await connectToTinglebot();
  return await SecretSantaMatch.find({ isPending: true }).lean();
}

// ------------------- Function: updateSettings -------------------
async function updateSettings(updateData) {
  await connectToTinglebot();
  const settings = await SecretSantaSettings.getSettings();
  
  Object.assign(settings, updateData);
  await settings.save();
  
  return settings;
}

// ------------------- Function: setTempSignupData -------------------
async function setTempSignupData(userId, data) {
  await connectToTinglebot();
  
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
  
  await TempSignupData.findOneAndUpdate(
    { userId },
    { ...data, expiresAt },
    { upsert: true }
  );
  
  return true;
}

// ------------------- Function: getTempSignupData -------------------
async function getTempSignupData(userId) {
  await connectToTinglebot();
  const tempData = await TempSignupData.findOne({ userId }).lean();
  return tempData;
}

// ------------------- Function: markAssignmentReceived -------------------
async function markAssignmentReceived(userId) {
  await connectToTinglebot();
  await SecretSantaParticipant.updateOne(
    { userId },
    { $set: { receivedAssignment: true } }
  );
}

// ============================================================================
// ------------------- Matching Logic -------------------
// ============================================================================

// ------------------- Function: matchParticipants -------------------
async function matchParticipants(client, sendDMs = true) {
  const data = await loadSecretSantaData();
  
  // Filter out substitutes who are only substitutes (not participating)
  const participants = data.participants.filter(p =>
    p &&
    p.userId &&
    p.isSubstitute !== 'only_sub' &&
    Array.isArray(p.characterLinks) &&
    p.characterLinks.length > 0
  );
  
  const substitutes = data.participants.filter(p => 
    p && (p.isSubstitute === 'yes' || p.isSubstitute === 'only_sub')
  );
  
  if (participants.length < 2) {
    logger.warn('SECRET_SANTA', `Not enough participants to match (need at least 2, found ${participants.length})`);
    return { success: false, message: `Not enough participants to match (need at least 2, found ${participants.length})` };
  }
  
  // Retry matching up to 200 times to ensure everyone gets matched
  let matches = [];
  let unmatchedDetails = [];
  const maxAttempts = 200;
  
  // Helper function to check if an avoid list entry matches a name
  // Uses strict matching: exact match always works, substring matching only for entries >= 3 chars
  function matchesAvoidEntry(avoidEntry, name) {
    const normalizedAvoided = avoidEntry.toLowerCase().trim();
    const normalizedName = name.toLowerCase().trim();
    
    // Always check exact match first
    if (normalizedName === normalizedAvoided) {
      return true;
    }
    
    // Only do substring matching if the avoid entry is at least 3 characters long
    // This prevents false positives like "a" matching "reaverofhearts"
    if (normalizedAvoided.length >= 3) {
      // Check if name contains the avoid entry (e.g., "ruutuli" contains "ruu")
      if (normalizedName.includes(normalizedAvoided)) {
        return true;
      }
      // Check if avoid entry contains the name (e.g., avoid entry is "ruutuli123" and name is "ruutuli")
      if (normalizedAvoided.includes(normalizedName)) {
        return true;
      }
    }
    
    return false;
  }
  
  // Helper function to check if two participants can match (respects avoid lists)
  function canMatch(santa, giftee) {
    if (santa.userId === giftee.userId) return false;
    
    // Check if santa wants to avoid giftee
    if (santa.membersToAvoid && santa.membersToAvoid.some(avoidedName => {
      const gifteeDiscord = giftee.discordName || '';
      const gifteeUsername = giftee.username || '';
      return matchesAvoidEntry(avoidedName, gifteeDiscord) ||
             matchesAvoidEntry(avoidedName, gifteeUsername);
    })) {
      return false;
    }
    
    // Check if giftee wants to avoid santa
    if (giftee.membersToAvoid && giftee.membersToAvoid.some(avoidedName => {
      const santaDiscord = santa.discordName || '';
      const santaUsername = santa.username || '';
      return matchesAvoidEntry(avoidedName, santaDiscord) ||
             matchesAvoidEntry(avoidedName, santaUsername);
    })) {
      return false;
    }
    
    return true;
  }
  
  // Fisher-Yates shuffle function for truly random shuffling
  function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // COMPLETELY START OVER - reset everything
    matches = [];
    const matchedGifteeIds = new Set();
    unmatchedDetails = [];
    
    // Calculate compatibility counts for each participant (how many people they can match with)
    const participantCompatibility = new Map();
    for (const santa of participants) {
      let count = 0;
      for (const giftee of participants) {
        if (canMatch(santa, giftee)) count++;
      }
      participantCompatibility.set(santa.userId, count);
    }
    
    // Shuffle participants COMPLETELY randomly, but prioritize those with fewer options
    let shuffledSantas = shuffleArray(participants);
    // Sort by compatibility (fewer options first) but keep randomization within same compatibility
    shuffledSantas.sort((a, b) => {
      const aCompat = participantCompatibility.get(a.userId) || 0;
      const bCompat = participantCompatibility.get(b.userId) || 0;
      if (aCompat !== bCompat) {
        return aCompat - bCompat; // Fewer options first
      }
      // If same compatibility, keep random order from shuffle
      return 0;
    });
    
    for (const santa of shuffledSantas) {
      // Find a compatible giftee
      let giftee = undefined;
      let matchReason = null;
    
      // Filter compatible giftees: not themselves, not already matched, and respects avoid lists
      const compatibleGiftees = participants.filter(g => {
        if (g.userId === santa.userId) return false; // Can't match with themselves
        if (matchedGifteeIds.has(g.userId)) return false; // Already matched
        return canMatch(santa, g); // Check avoid lists
      });
      
      if (compatibleGiftees.length === 0) {
        // Try aggressive swapping: find any existing match where we can swap
        const shuffledMatches = shuffleArray([...matches]);
        let swapped = false;
        
        for (const existingMatch of shuffledMatches) {
          if (swapped) break;
          
          const currentGiftee = participants.find(p => p.userId === existingMatch.gifteeId);
          const currentSanta = participants.find(p => p.userId === existingMatch.santaId);
          
          if (!currentSanta || !currentGiftee) continue;
          
          // Check if santa can match with current giftee (that we want to free up)
          if (!canMatch(santa, currentGiftee)) continue;
          
          // Find a new giftee for current santa (who is losing their current giftee)
          const availableForCurrentSanta = participants.filter(g => {
            if (g.userId === currentSanta.userId) return false;
            if (g.userId === currentGiftee.userId) return false; // We're freeing this up
            if (g.userId === santa.userId) return false;
            return canMatch(currentSanta, g);
          });
          
          if (availableForCurrentSanta.length > 0) {
            // Prefer unmatched giftees for current santa
            const unmatchedForCurrent = availableForCurrentSanta.filter(g => !matchedGifteeIds.has(g.userId));
            const newGifteeForCurrent = (unmatchedForCurrent.length > 0 ? unmatchedForCurrent : availableForCurrentSanta)[
              Math.floor(Math.random() * (unmatchedForCurrent.length > 0 ? unmatchedForCurrent.length : availableForCurrentSanta.length))
            ];
            
            // If new giftee is already matched, remove that match (chain swap)
            if (matchedGifteeIds.has(newGifteeForCurrent.userId)) {
              const oldMatchIndex = matches.findIndex(m => m.gifteeId === newGifteeForCurrent.userId);
              if (oldMatchIndex >= 0) {
                matchedGifteeIds.delete(newGifteeForCurrent.userId);
                matches.splice(oldMatchIndex, 1);
              }
            }
            
            // Update the existing match
            const matchIndex = matches.findIndex(m => m.santaId === existingMatch.santaId);
            if (matchIndex >= 0) {
              matchedGifteeIds.delete(currentGiftee.userId);
              matches[matchIndex].gifteeId = newGifteeForCurrent.userId;
              matchedGifteeIds.add(newGifteeForCurrent.userId);
            }
            
            // Match santa with the freed-up giftee
            giftee = currentGiftee;
            matchReason = 'swap';
            swapped = true;
            logger.info('SECRET_SANTA', `Swapped match: ${currentSanta.username || currentSanta.userId} → ${newGifteeForCurrent.username || newGifteeForCurrent.userId}, ${santa.username || santa.userId} → ${currentGiftee.username || currentGiftee.userId}`);
          }
        }
        
        // If still no match, log detailed info for debugging
        if (!swapped) {
          const unmatchedGiftees = participants.filter(g => {
            if (g.userId === santa.userId) return false;
            return !matchedGifteeIds.has(g.userId);
          });
          
          const blockedCount = unmatchedGiftees.filter(g => !canMatch(santa, g)).length;
          
          // Detailed debugging: show exactly why ruutuli (or any participant) can't be matched
          // Only log detailed info on first attempt or last 5 attempts to avoid spam
          const shouldLogDetails = attempt === 0 || attempt >= maxAttempts - 5;
          
          if (blockedCount > 0 && unmatchedGiftees.length > 0 && shouldLogDetails) {
            const blockingDetails = [];
            for (const giftee of unmatchedGiftees) {
              if (!canMatch(santa, giftee)) {
                const reasons = [];
                
                // Check if santa wants to avoid this giftee
                if (santa.membersToAvoid && santa.membersToAvoid.some(avoidedName => {
                  const gifteeDiscord = giftee.discordName || '';
                  const gifteeUsername = giftee.username || '';
                  return matchesAvoidEntry(avoidedName, gifteeDiscord) ||
                         matchesAvoidEntry(avoidedName, gifteeUsername);
                })) {
                  reasons.push(`${santa.username || santa.discordName || santa.userId} has ${giftee.username || giftee.discordName || giftee.userId} in their avoid list`);
                }
                
                // Check if giftee wants to avoid this santa
                if (giftee.membersToAvoid && giftee.membersToAvoid.some(avoidedName => {
                  const santaDiscord = santa.discordName || '';
                  const santaUsername = santa.username || '';
                  return matchesAvoidEntry(avoidedName, santaDiscord) ||
                         matchesAvoidEntry(avoidedName, santaUsername);
                })) {
                  reasons.push(`${giftee.username || giftee.discordName || giftee.userId} has ${santa.username || santa.discordName || santa.userId} in their avoid list`);
                }
                
                blockingDetails.push(`${giftee.username || giftee.discordName || giftee.userId}: ${reasons.join('; ')}`);
              }
            }
            
            logger.warn('SECRET_SANTA', `[Attempt ${attempt + 1}] Cannot match ${santa.username || santa.discordName || santa.userId} - ${unmatchedGiftees.length} unmatched, ${blockedCount} blocked by avoid lists`);
            logger.warn('SECRET_SANTA', `Blocking details for ${santa.username || santa.discordName || santa.userId}:`);
            blockingDetails.forEach(detail => logger.warn('SECRET_SANTA', `  - ${detail}`));
            
            // Also show santa's avoid list
            if (santa.membersToAvoid && santa.membersToAvoid.length > 0) {
              logger.warn('SECRET_SANTA', `${santa.username || santa.discordName || santa.userId}'s avoid list: ${santa.membersToAvoid.join(', ')}`);
            }
          }
          
          // Build detailed reason for unmatched participant
          let detailedReason = '';
          if (unmatchedGiftees.length === 0) {
            detailedReason = 'no available giftees remaining (all participants already matched)';
          } else {
            // Collect blocking information
            const blockingInfo = [];
            for (const giftee of unmatchedGiftees) {
              if (!canMatch(santa, giftee)) {
                const reasons = [];
                if (santa.membersToAvoid && santa.membersToAvoid.some(avoidedName => {
                  const gifteeDiscord = giftee.discordName || '';
                  const gifteeUsername = giftee.username || '';
                  return matchesAvoidEntry(avoidedName, gifteeDiscord) ||
                         matchesAvoidEntry(avoidedName, gifteeUsername);
                })) {
                  reasons.push(`has ${giftee.username || giftee.discordName || giftee.userId} in avoid list`);
                }
                if (giftee.membersToAvoid && giftee.membersToAvoid.some(avoidedName => {
                  const santaDiscord = santa.discordName || '';
                  const santaUsername = santa.username || '';
                  return matchesAvoidEntry(avoidedName, santaDiscord) ||
                         matchesAvoidEntry(avoidedName, santaUsername);
                })) {
                  reasons.push(`${giftee.username || giftee.discordName || giftee.userId} has them in avoid list`);
                }
                if (reasons.length > 0) {
                  blockingInfo.push(`${giftee.username || giftee.discordName || giftee.userId} (${reasons.join(', ')})`);
                }
              }
            }
            
            if (blockingInfo.length > 0) {
              detailedReason = `all ${unmatchedGiftees.length} available giftee(s) violate avoid lists: ${blockingInfo.join('; ')}`;
            } else {
              detailedReason = `all ${unmatchedGiftees.length} available giftee(s) violate avoid lists`;
            }
          }
          
          unmatchedDetails.push({
            participant: santa.discordName || santa.username || santa.userId,
            reason: detailedReason
          });
        }
      } else {
        // Pick a random compatible giftee
        giftee = compatibleGiftees[Math.floor(Math.random() * compatibleGiftees.length)];
        matchReason = 'normal';
      }
      
      if (giftee) {
        matches.push({
          santaId: santa.userId,
          gifteeId: giftee.userId,
          matchedAt: new Date().toISOString(),
        });
        matchedGifteeIds.add(giftee.userId);
      } else {
        logger.error('SECRET_SANTA', `Could not find a match for ${santa.username}`);
      }
    }
    
    // Handle any unmatched participants
    const matchedSantaIds = new Set(matches.map(m => m.santaId));
    const unmatched = participants.filter(p => !matchedSantaIds.has(p.userId));
    
    // If everyone is matched, we're done!
    if (unmatched.length === 0) {
      logger.info('SECRET_SANTA', `Successfully matched all ${matches.length} participants on attempt ${attempt + 1}`);
      break;
    }
    
    // If this is the last attempt, try final fallback matching (ignore avoid lists)
    if (attempt === maxAttempts - 1) {
      logger.warn('SECRET_SANTA', `${unmatched.length} participant(s) could not be matched after ${maxAttempts} attempts:`, unmatched.map(u => u.username || u.discordName || u.userId));
      
      // For any remaining unmatched participants, try fallback matching (ignore avoid lists)
      for (const santa of unmatched) {
        const availableGiftees = participants.filter(g => {
          if (g.userId === santa.userId) return false;
          const matchedGifteeIds = new Set(matches.map(m => m.gifteeId));
          if (matchedGifteeIds.has(g.userId)) return false;
          return true;
        });
        
        if (availableGiftees.length > 0) {
          const giftee = availableGiftees[Math.floor(Math.random() * availableGiftees.length)];
          matches.push({
            santaId: santa.userId,
            gifteeId: giftee.userId,
            matchedAt: new Date().toISOString(),
          });
          logger.warn('SECRET_SANTA', `Final fallback match: ${santa.username || santa.discordName || santa.userId} → ${giftee.username || giftee.discordName || giftee.userId} (ignore avoid lists)`);
        } else {
          unmatchedDetails.push({
            participant: santa.discordName || santa.username || santa.userId,
            reason: 'no available giftees remaining (all participants already matched)'
          });
        }
      }
    } else {
      // Log attempt but continue trying (only log every 10 attempts to reduce spam)
      if (attempt % 10 === 0 || attempt < 5) {
        logger.debug('SECRET_SANTA', `Attempt ${attempt + 1}: ${unmatched.length} participant(s) unmatched, retrying...`);
      }
    }
  }
  
  // Final check for unmatched
  const finalMatchedSantaIds = new Set(matches.map(m => m.santaId));
  const finalUnmatched = participants.filter(p => !finalMatchedSantaIds.has(p.userId));
  
  if (finalUnmatched.length > 0 && unmatchedDetails.length === 0) {
    // Update unmatched details if we still have unmatched
    finalUnmatched.forEach(santa => {
      unmatchedDetails.push({
        participant: santa.discordName || santa.username,
        reason: 'no compatible matches found after all retry attempts'
      });
    });
  }
  
  // Validate no duplicate santas or giftees
  const santaIds = new Set(matches.map(m => m.santaId));
  const gifteeIds = new Set(matches.map(m => m.gifteeId));
  
  if (santaIds.size !== matches.length) {
    logger.error('SECRET_SANTA', 'Duplicate santas found in matches!');
    return { success: false, message: 'Duplicate santas found in matches!' };
  }
  
  if (gifteeIds.size !== matches.length) {
    logger.error('SECRET_SANTA', 'Duplicate giftees found in matches!');
    return { success: false, message: 'Duplicate giftees found in matches!' };
  }
  
  // Clear all existing matches (both pending and approved) before saving new ones
  await connectToTinglebot();
  await SecretSantaMatch.deleteMany({});
  
  // Save matches as pending (waiting for approval)
  await savePendingMatches(matches);
  
  if (sendDMs) {
    // Send DMs to all matched participants
    await sendAssignmentDMs(client);
  }
  
  logger.success('SECRET_SANTA', `Matched ${matches.length} participants${sendDMs ? ' and sent DMs' : ' (pending approval)'}`);
  return { success: true, matches, unmatched: finalUnmatched, unmatchedDetails };
}

// ============================================================================
// ------------------- DM Assignment System -------------------
// ============================================================================

const BORDER_IMAGE = 'https://storage.googleapis.com/tinglebot/Graphics/border.png';

// ------------------- Function: sendAssignmentDMs -------------------
async function sendAssignmentDMs(client) {
  const data = await loadSecretSantaData();
  const matches = await SecretSantaMatch.find({ isPending: false }).lean();
  
  if (matches.length === 0) {
    logger.warn('SECRET_SANTA', 'No approved matches found to send DMs');
    return;
  }
  
  for (const match of matches) {
    const santa = await SecretSantaParticipant.findOne({ userId: match.santaId }).lean();
    const giftee = await SecretSantaParticipant.findOne({ userId: match.gifteeId }).lean();
    
    if (!santa || !giftee) {
      logger.error('SECRET_SANTA', `Missing participant data for match: santa=${match.santaId}, giftee=${match.gifteeId}`);
      continue;
    }
    
    try {
      const user = await client.users.fetch(santa.userId);
      
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle('🎁 Roots Secret Santa Assignment!')
        .setDescription(`**You have been assigned a giftee for the Roots Secret Santa!**\n\nUse the information below to create art for your giftee.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
        .setImage(BORDER_IMAGE)
        .setColor(0x00AE86)
        .addFields(
          { name: '👤 Your Giftee', value: `**${giftee.discordName}**`, inline: false },
          { name: '🔗 Character Links', value: giftee.characterLinks && giftee.characterLinks.length > 0 ? giftee.characterLinks.map((link) => `• ${link}`).join('\n') : '*None*', inline: false }
        )
        .setTimestamp();
      
      if (giftee.preferredCharacterRequests) {
        embed.addFields({
          name: '✨ Preferred Character Requests',
          value: giftee.preferredCharacterRequests,
          inline: false,
        });
      }
      
      if (giftee.otherCharacterRequests) {
        embed.addFields({
          name: '💭 Other Character Requests',
          value: giftee.otherCharacterRequests,
          inline: false,
        });
      }
      
      if (giftee.contentToAvoid) {
        embed.addFields({
          name: '⚠️ Content to Avoid',
          value: giftee.contentToAvoid,
          inline: false,
        });
      }
      
      const submissionDeadline = new Date(data.settings.submissionDeadline);
      embed.addFields({
        name: '📅 Important Dates',
        value: `**Submission Deadline:**\n<t:${Math.floor(submissionDeadline.getTime() / 1000)}:R> • <t:${Math.floor(submissionDeadline.getTime() / 1000)}:F>\n*11:59 PM EST*\n\n` +
          `Send your gift art **DIRECTLY** to your giftee between **December 24th** and **January 14th at 11:59 PM EST**!\n` +
          `If you can't make the deadline, inform us by the **first week of January**.`,
        inline: false,
      });
      
      embed.addFields({
        name: '🎨 Gift Requirements',
        value: `**Art Gifts:**\n• At least one requested character\n• Lined with flat colors\n• Full body or bust, background optional\n• Intentional stylization is acceptable`,
        inline: false,
      });
      
      embed.addFields({
        name: '🔒 Keep It Secret!',
        value: `**Don't tell anyone who you are drawing for - it's a secret!** 🤫`,
        inline: false,
      });
      
      await user.send({ embeds: [embed] });
      await markAssignmentReceived(santa.userId);
      logger.success('SECRET_SANTA', `Sent assignment DM to ${santa.username || santa.userId}`);
    } catch (error) {
      // Handle specific Discord errors
      if (error.code === 50007) {
        logger.error('SECRET_SANTA', `Cannot send DM to ${santa.username || santa.userId}: User has DMs disabled`);
        
        // Send notification to logging channel
        await sendDMFailureNotification(client, santa, giftee, 'DMs disabled');
      } else {
        logger.error('SECRET_SANTA', `Error sending DM to ${santa.username || santa.userId}:`, error.message || error);
        
        // Send notification to logging channel
        await sendDMFailureNotification(client, santa, giftee, error.message || 'Unknown error');
      }
    }
  }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Function: sendDMFailureNotification -------------------
async function sendDMFailureNotification(client, santa, giftee, reason) {
  try {
    const LOG_CHANNEL_ID = process.env.MOD_LOG_CHANNEL_ID || process.env.MOD_LOG_CHANNEL || process.env.CONSOLE_LOG_CHANNEL;
    if (!LOG_CHANNEL_ID) {
      logger.warn('SECRET_SANTA', 'No logging channel configured for DM failures');
      return;
    }
    
    const channel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (!channel) {
      logger.warn('SECRET_SANTA', `Logging channel ${LOG_CHANNEL_ID} not found`);
      return;
    }
    
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Secret Santa DM Failure')
      .setDescription(`**Could not send assignment DM to Secret Santa**`)
      .setImage(BORDER_IMAGE)
      .setColor(0xFF0000)
      .addFields(
        { name: '🎅 Secret Santa', value: `${santa.discordName} (${santa.username})`, inline: false },
        { name: '🎁 Giftee', value: `${giftee.discordName} (${giftee.username})`, inline: false },
        { name: '❌ Reason', value: reason, inline: false },
        { name: '💡 Action Required', value: 'Please manually DM this user their assignment.', inline: false }
      )
      .setTimestamp();
    
    await channel.send({ embeds: [embed] });
  } catch (error) {
    logger.error('SECRET_SANTA', `Error sending DM failure notification: ${error.message}`);
  }
}

// ------------------- Function: initializeBlacklist -------------------
// Ensures default blacklisted users are added to database settings on startup
async function initializeBlacklist() {
  await connectToTinglebot();
  
  const settings = await SecretSantaSettings.getSettings();
  const defaultBlacklist = ['bogoro', 'ellowwell'];
  
  // Get current blacklist from database
  const currentBlacklist = settings.blacklistedUsers || [];
  
  // Add default blacklist entries if they don't already exist
  let updated = false;
  for (const defaultUser of defaultBlacklist) {
    const normalizedDefault = defaultUser.toLowerCase();
    const exists = currentBlacklist.some(user => user.toLowerCase() === normalizedDefault);
    
    if (!exists) {
      currentBlacklist.push(defaultUser);
      updated = true;
    }
  }
  
  // Update settings if changes were made
  if (updated) {
    settings.blacklistedUsers = currentBlacklist;
    await settings.save();
    logger.info('SECRET_SANTA', `Initialized blacklist: Added default blacklisted users to database settings`);
  }
  
  return settings;
}

// ------------------- Function: isBlacklisted -------------------
async function isBlacklisted(userId, username, discordName) {
  const data = await loadSecretSantaData();
  const blacklist = data.settings.blacklistedUsers || [];
  
  // Check against blacklist (all entries should already be in database from initialization)
  const allBlacklisted = [...blacklist];
  
  // Check userId, username, and discordName
  const userIdentifier = userId?.toLowerCase();
  const usernameLower = username?.toLowerCase();
  const discordNameLower = discordName?.toLowerCase();
  
  return allBlacklisted.some(blacklisted => {
    const blacklistedLower = blacklisted.toLowerCase();
    return userIdentifier === blacklistedLower || 
           usernameLower === blacklistedLower || 
           discordNameLower === blacklistedLower ||
           usernameLower?.includes(blacklistedLower) ||
           discordNameLower?.includes(blacklistedLower);
  });
}

// ============================================================================
// ------------------- Scheduler Functions -------------------
// ============================================================================

// ------------------- Function: checkDeadlineAndMatch -------------------
async function checkDeadlineAndMatch(client) {
  const data = await loadSecretSantaData();
  const now = new Date();
  
  // Check if signup deadline has passed - only close signups, don't auto-match
  if (now >= data.settings.signupDeadline && data.settings.signupsOpen && !data.settings.matched) {
    logger.info('SECRET_SANTA', 'Signup deadline passed, closing signups (manual matching required)');
    
    await updateSettings({ signupsOpen: false });
  }
}


// ------------------- Function: setupSecretSantaScheduler -------------------
function setupSecretSantaScheduler(client) {
  // Initialize blacklist on startup (after a delay to ensure MongoDB is ready)
  setTimeout(async () => {
    try {
      await initializeBlacklist();
    } catch (error) {
      logger.error('SECRET_SANTA', 'Error initializing blacklist on startup:', error);
    }
  }, 5000); // 5 seconds after startup
  
  // Check for deadline matching every hour
  setInterval(async () => {
    try {
      await checkDeadlineAndMatch(client);
    } catch (error) {
      logger.error('SECRET_SANTA', 'Error in deadline check:', error);
    }
  }, 60 * 60 * 1000); // 1 hour
  
  // Also check immediately on startup (after a delay to ensure MongoDB is ready)
  setTimeout(async () => {
    try {
      await checkDeadlineAndMatch(client);
    } catch (error) {
      logger.error('SECRET_SANTA', 'Error in startup Secret Santa check:', error);
    }
  }, 10000); // 10 seconds after startup
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
  loadSecretSantaData,
  saveParticipant,
  getParticipant,
  removeParticipant,
  savePendingMatches,
  approveMatches,
  getPendingMatches,
  updateSettings,
  setTempSignupData,
  getTempSignupData,
  markAssignmentReceived,
  matchParticipants,
  sendAssignmentDMs,
  checkDeadlineAndMatch,
  setupSecretSantaScheduler,
  initializeBlacklist,
  isBlacklisted
};

