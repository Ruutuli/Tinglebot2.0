// ============================================================================
// ------------------- Import necessary modules -------------------
// Discord.js for slash commands and embeds
// ============================================================================
const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ComponentType 
} = require('discord.js');

// ============================================================================
// ------------------- Import database models and utilities -------------------
// Models for game sessions and character management
// ============================================================================
const Minigame = require('../../models/MinigameModel');
const Character = require('../../models/CharacterModel');
const User = require('../../models/UserModel');
const { generateUniqueId } = require('../../utils/uniqueIdUtils');
const { handleInteractionError } = require('../../utils/globalErrorHandler');
const { getVillageEmojiByName } = require('../../modules/locationsModule');
const { addItemInventoryDatabase } = require('../../utils/inventoryUtils');

// ============================================================================
// ------------------- Import minigame module -------------------
// Core game logic and utilities
// ============================================================================
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

// ============================================================================
// ------------------- Helper Functions -------------------
// Utility functions for better error handling
// ============================================================================

// ------------------- Function: getSessionDiagnosticMessage -------------------
// Provides detailed error messages for session issues
async function getSessionDiagnosticMessage(sessionId) {
  // First check if session exists at all
  const sessionExists = await Minigame.findOne({
    sessionId: sessionId,
    gameType: 'theycame'
  });
  
  if (!sessionExists) {
    return `❌ Game session **${sessionId}** not found. Please check the session ID and try again.`;
  }
  
  
  // Check if session is finished
  if (sessionExists.status === 'finished') {
    return `❌ Game session **${sessionId}** has already finished. The game is complete and no more rolls are allowed. Please start a new game.`;
  }
  
  // Check if session is in the right status
  if (!['waiting', 'active'].includes(sessionExists.status)) {
    return `❌ Game session **${sessionId}** is in an invalid state (${sessionExists.status}). Please start a new game.`;
  }
  
  // If we get here, session should be valid
  return null;
}

// ------------------- Function: createSimpleErrorEmbed -------------------
// Creates a simple error embed without game images for turn errors
function createSimpleErrorEmbed(message, characterIcon = null) {
  const embed = new EmbedBuilder()
    .setTitle('👽 They Came for the Cows - Defense Roll')
    .setDescription(message)
    .setColor('#FF0000') // Red color for errors
    .setTimestamp();
  
  // Add character thumbnail if provided
  if (characterIcon) {
    embed.setThumbnail(characterIcon);
  }
  
  return embed;
}

// ------------------- Function: determineMinigameRewards -------------------
// Determines rewards based on animals lost and village type
function determineMinigameRewards(animalsLost, village) {
  const rewards = [];
  
  if (animalsLost === 0) {
    // Perfect defense - Spirit Orb (fat chance)
    rewards.push({ name: 'Spirit Orb', quantity: 1, description: 'Perfect defense! No animals lost!' });
  } else if (animalsLost >= 1 && animalsLost <= 5) {
    // Good defense - Colored gem based on village
    let gemName;
    switch (village) {
      case 'rudania':
        gemName = 'Ruby';
        break;
      case 'inariko':
        gemName = 'Sapphire';
        break;
      case 'vhintl':
        gemName = 'Emerald';
        break;
      default:
        gemName = 'Ruby'; // Default to Ruby
    }
    rewards.push({ name: gemName, quantity: 1, description: `Good defense! Only ${animalsLost} animals lost.` });
  } else if (animalsLost >= 6 && animalsLost <= 10) {
    // Poor defense - Knight's Broadsword
    rewards.push({ name: 'Knight\'s Broadsword', quantity: 1, description: `They clearly need new weapons at this point, right? (${animalsLost} animals lost)` });
  } else if (animalsLost >= 11 && animalsLost <= 15) {
    // Very poor defense - Hateno Cheese
    rewards.push({ name: 'Hateno Cheese', quantity: 2, description: `Well, you tried, have some produce? (${animalsLost} animals lost)` });
  } else if (animalsLost >= 16 && animalsLost <= 24) {
    // Terrible defense - Swift Carrot
    rewards.push({ name: 'Swift Carrot', quantity: 3, description: `You clearly need to be faster! (${animalsLost} animals lost)` });
  } else if (animalsLost === 25) {
    // Total failure - Wool and Leather
    rewards.push({ name: 'Wool', quantity: 3, description: 'All the animals are gone... a pile of these appeared in the morning...' });
    rewards.push({ name: 'Leather', quantity: 3, description: 'All the animals are gone... a pile of these appeared in the morning...' });
  }
  
  return rewards;
}

// ------------------- Function: distributeMinigameRewards -------------------
// Distributes rewards to all players who participated in the minigame
async function distributeMinigameRewards(session, animalsLost, interaction) {
  const rewards = determineMinigameRewards(animalsLost, session.village);
  const results = {
    success: true,
    errors: [],
    rewardsGiven: [],
    totalPlayers: session.players.length,
    tokensAwarded: 0
  };
  
  if (rewards.length === 0) {
    console.log(`[MINIGAME] No rewards to distribute for ${animalsLost} animals lost`);
    return results;
  }
  
  console.log(`[MINIGAME] Distributing rewards for ${animalsLost} animals lost:`, rewards.map(r => `${r.quantity}x ${r.name}`).join(', '));
  
  // Process each player
  for (const player of session.players) {
    try {
      // Fetch character
      const { fetchCharacterByNameAndUserId, fetchModCharacterByNameAndUserId } = require('../../database/db');
      let character = await fetchCharacterByNameAndUserId(player.characterName, player.discordId);
      
      // If not found as regular character, try as mod character
      if (!character) {
        character = await fetchModCharacterByNameAndUserId(player.characterName, player.discordId);
      }
      
      if (!character) {
        console.error(`[MINIGAME] Character not found: ${player.characterName} (${player.discordId})`);
        results.errors.push(`Character ${player.characterName} not found`);
        continue;
      }
      
      // Distribute each reward to the character
      for (const reward of rewards) {
        try {
          await addItemInventoryDatabase(
            character._id,
            reward.name,
            reward.quantity,
            interaction,
            'Minigame Reward'
          );
          
          console.log(`[MINIGAME] Added ${reward.quantity}x ${reward.name} to ${character.name}`);
        } catch (itemError) {
          console.error(`[MINIGAME] Failed to add ${reward.name} to ${character.name}:`, itemError);
          results.errors.push(`Failed to add ${reward.name} to ${character.name}: ${itemError.message}`);
        }
      }
      
      // Calculate and distribute token rewards based on submissions
      const tokenReward = calculateMinigameTokenReward(animalsLost);
      if (tokenReward > 0) {
        try {
          const User = require('../../models/UserModel');
          const user = await User.findOne({ discordId: player.discordId });
          if (user) {
            user.tokens = (user.tokens || 0) + tokenReward;
            await user.save();
            results.tokensAwarded += tokenReward;
            console.log(`[MINIGAME] Added ${tokenReward} tokens to ${character.name}`);
          } else {
            console.error(`[MINIGAME] User not found for token distribution: ${player.discordId}`);
            results.errors.push(`User not found for token distribution: ${player.characterName}`);
          }
        } catch (tokenError) {
          console.error(`[MINIGAME] Failed to add tokens to ${character.name}:`, tokenError);
          results.errors.push(`Failed to add tokens to ${character.name}: ${tokenError.message}`);
        }
      }
      
      results.rewardsGiven.push({
        characterName: character.name,
        rewards: rewards.map(r => ({ name: r.name, quantity: r.quantity })),
        tokensAwarded: tokenReward
      });
      
    } catch (error) {
      console.error(`[MINIGAME] Error processing rewards for player ${player.characterName}:`, error);
      results.errors.push(`Error processing rewards for ${player.characterName}: ${error.message}`);
    }
  }
  
  if (results.errors.length > 0) {
    results.success = false;
  }
  
  return results;
}

// ------------------- Function: calculateMinigameTokenReward -------------------
// Calculates token rewards based on animals lost (per_unit: 222, max: 3 submissions)
function calculateMinigameTokenReward(animalsLost) {
  const perUnit = 222;
  const maxSubmissions = 3;
  
  // Calculate submissions based on performance
  // Better performance = more submissions allowed
  let submissions = 0;
  
  if (animalsLost === 0) {
    // Perfect defense - all 3 submissions
    submissions = 3;
  } else if (animalsLost >= 1 && animalsLost <= 5) {
    // Good defense - 2 submissions
    submissions = 2;
  } else if (animalsLost >= 6 && animalsLost <= 10) {
    // Poor defense - 1 submission
    submissions = 1;
  } else if (animalsLost >= 11 && animalsLost <= 15) {
    // Very poor defense - 1 submission
    submissions = 1;
  } else if (animalsLost >= 16 && animalsLost <= 24) {
    // Terrible defense - 1 submission
    submissions = 1;
  } else if (animalsLost === 25) {
    // Total failure - 0 submissions
    submissions = 0;
  }
  
  // Cap at maximum submissions
  submissions = Math.min(submissions, maxSubmissions);
  
  return submissions * perUnit;
}

// ============================================================================
// ------------------- Export the slash command -------------------
// Main command structure for minigames
// ============================================================================
module.exports = {
  data: new SlashCommandBuilder()
    .setName('minigame')
    .setDescription('🎮 Play minigames!')
    .addSubcommand(subcommand =>
      subcommand
        .setName('theycame-join')
        .setDescription('👽 Join an alien defense game')
        .addStringOption(option =>
          option.setName('session_id')
            .setDescription('Game session ID')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('character')
            .setDescription('Character name to join with')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('questid')
            .setDescription('Quest ID - required for quest participation')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('theycame-roll')
        .setDescription('🎲 Roll defense against an alien')
        .addStringOption(option =>
          option.setName('session_id')
            .setDescription('Game session ID')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('target')
            .setDescription('Target alien (e.g., 1A, 2B)')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  // ============================================================================
  // ------------------- Execute function -------------------
  // Main command handler for all minigame subcommands
  // ============================================================================
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    try {
      if (subcommand === 'theycame-join') {
        await this.handleJoin(interaction);
      } else if (subcommand === 'theycame-roll') {
        await this.handleRoll(interaction);
      } else {
        await interaction.reply({ content: '❌ Unknown minigame command.', ephemeral: true });
      }
    } catch (error) {
      await handleInteractionError(error, interaction, {
        source: 'minigame.js',
        subcommand: subcommand
      });
    }
  },




  // ============================================================================
  // ------------------- Join Game Handler -------------------
  // ============================================================================
  async handleJoin(interaction) {
    let sessionId = interaction.options.getString('session_id');
    const resolvedCharacterName = interaction.options.getString('character');
    const questId = interaction.options.getString('questid');
    const userId = interaction.user.id;
    
    // Extract session ID from the full display text if needed
    // Handle cases where sessionId might be "⚔ A868409 | 4 players | Created: 9/7/2025"
    const sessionIdMatch = sessionId.match(/A\d+/);
    if (sessionIdMatch) {
      sessionId = sessionIdMatch[0];
    }
    
    // Defer reply to prevent interaction timeout
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }
    
    // Validate character name
    if (!resolvedCharacterName) {
      return await interaction.editReply({
        content: '❌ Please specify a character name to join.'
      });
    }
    
    // TODO: Make quest ID required after testing - currently optional for testing
    let quest = null;
    if (questId) {
      // Validate quest participation if quest ID provided
      const Quest = require('../../models/QuestModel');
      quest = await Quest.findOne({ questID: questId });
      
      if (!quest) {
        return await interaction.editReply({
          content: `❌ Quest with ID "${questId}" not found.`
        });
      }
      
      if (!quest.participants.has(userId)) {
        return await interaction.editReply({
          content: `❌ You must first join the quest "${quest.title}" before participating in the minigame. Use /quest join questid:${questId} charactername:${resolvedCharacterName}`
        });
      }
      
      // Verify the character matches the quest participant
      const participant = quest.participants.get(userId);
      if (participant.characterName !== resolvedCharacterName) {
        return await interaction.editReply({
          content: `❌ You are participating in this quest with character "${participant.characterName}", not "${resolvedCharacterName}".`
        });
      }
    }
    
    // Fetch character
    const { fetchCharacterByNameAndUserId, fetchModCharacterByNameAndUserId } = require('../../database/db');
    let character = await fetchCharacterByNameAndUserId(resolvedCharacterName, userId);
    
    // If not found as regular character, try as mod character
    if (!character) {
      character = await fetchModCharacterByNameAndUserId(resolvedCharacterName, userId);
    }
    
    if (!character) {
      return await interaction.editReply({
        content: `❌ Character "${resolvedCharacterName}" not found or does not belong to you.`
      });
    }
    
    const username = character.name;
    
    // Check session with detailed error messages
    const sessionError = await getSessionDiagnosticMessage(sessionId);
    if (sessionError) {
      return await interaction.editReply({
        content: sessionError
      });
    }
    
    // Find the specific session (we know it exists and is valid now)
    const session = await Minigame.findOne({
      sessionId: sessionId,
      gameType: 'theycame',
      status: { $in: ['waiting', 'active'] }
    });
    
    // Check if character is in the correct village for this minigame
    if (session.village && character.currentVillage !== session.village) {
      const villageDisplayName = session.village.charAt(0).toUpperCase() + session.village.slice(1);
      const currentVillageDisplayName = character.currentVillage.charAt(0).toUpperCase() + character.currentVillage.slice(1);
      const villageEmoji = getVillageEmojiByName(session.village) || '';
      const currentVillageEmoji = getVillageEmojiByName(character.currentVillage) || '';
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Wrong Village Location')
        .setDescription(`**${resolvedCharacterName}** is currently in ${currentVillageEmoji} **${currentVillageDisplayName}** but this minigame is taking place in ${villageEmoji} **${villageDisplayName}**!`)
        .setColor(0xFF0000) // Red for error
        .setThumbnail(character.icon)
        .addFields(
          {
            name: '🚶‍♀️ How to Travel',
            value: `Use </travel:1405184599805394944> to travel **${resolvedCharacterName}** to ${villageEmoji} **${villageDisplayName}** before joining the minigame.`,
            inline: false
          },
          {
            name: '📍 Current Location',
            value: `${currentVillageEmoji} **${currentVillageDisplayName}**`,
            inline: true
          },
          {
            name: '🎯 Required Location',
            value: `${villageEmoji} **${villageDisplayName}**`,
            inline: true
          }
        )
        .setFooter({ text: 'Travel to the correct village and try joining again!' })
        .setTimestamp();
      
      return await interaction.editReply({
        embeds: [errorEmbed]
      });
    }
    
    // Check if character already joined
    const alreadyJoined = session.players.find(p => p.characterId === character._id.toString());
    if (alreadyJoined) {
      return await interaction.editReply({
        content: `✅ **${character.name}** is already in the game!`
      });
    }
    
    // Add character to game
    session.players.push({
      discordId: userId,
      characterName: character.name,
      characterId: character._id.toString(),
      isModCharacter: character.isModCharacter || false,
      joinedAt: new Date()
    });
    
    // Add player to turn order
    const result = addPlayerToTurnOrder(session.gameData, userId, username);
    
    session.markModified('gameData');
    await session.save();
    
    // Update the game message
    await this.updateGameMessage(interaction, session);
    
    // Create join confirmation embed
    const embedResult = await this.createJoinEmbed(session, character, result.message);
    const replyOptions = {
      embeds: [embedResult.embed]
    };
    if (embedResult.attachment) {
      replyOptions.files = [embedResult.attachment];
    }
    
    await interaction.editReply(replyOptions);
    
    // Check if we have 6 players and should auto-start (separate message)
    if (session.players.length === 6 && session.status === 'waiting') {
      console.log(`[MINIGAME] Auto-starting game with 6 players for session ${session.sessionId}`);
      
      // Auto-start the game
      const { spawnAliens } = require('../../modules/minigameModule');
      const playerCount = session.gameData.turnOrder.length || session.players.length;
      const spawnResult = spawnAliens(session.gameData, playerCount, 0); // Pass 0 for first turn
      
      // Update session status
      session.gameData.currentRound = 1;
      session.status = 'active';
      
      
      // Update the game message
      await this.updateGameMessage(interaction, session);
      
      // Get first player in turn order for mention
      const firstPlayer = session.gameData.turnOrder[0];
      const firstPlayerMention = firstPlayer ? `<@${firstPlayer.discordId}>` : '';
      
      // Create auto-start embed (like start game embed)
      const startEmbedResult = await this.createMinigameEmbed(session, 'Game Started!');
      const startReplyOptions = {
        content: `🎮 **Game Auto-Started!** ${spawnResult.message}\n\n🎯 ${firstPlayerMention}, it's your turn! Use </minigame theycame-roll:1413815457118556201> to attack aliens!`,
        embeds: [startEmbedResult.embed]
      };
      if (startEmbedResult.attachment) {
        startReplyOptions.files = [startEmbedResult.attachment];
      }
      
      // Post auto-start as follow-up message
      await interaction.followUp(startReplyOptions);
    }
  },

  // ============================================================================
  // ------------------- Roll Defense Handler -------------------
  // ============================================================================
  async handleRoll(interaction) {
    let sessionId = interaction.options.getString('session_id');
    const target = interaction.options.getString('target');
    const userId = interaction.user.id;
    
    // Extract session ID from the full display text if needed
    // Handle cases where sessionId might be "⚔ A868409 | 4 players | Created: 9/7/2025"
    const sessionIdMatch = sessionId.match(/A\d+/);
    if (sessionIdMatch) {
      sessionId = sessionIdMatch[0];
    }
    
    // Defer reply to prevent interaction timeout
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }
    
    // Check session with detailed error messages
    const sessionError = await getSessionDiagnosticMessage(sessionId);
    if (sessionError) {
      return await interaction.editReply({
        content: sessionError
      });
    }
    
    // Find the session (we know it exists and is valid now)
    const session = await Minigame.findOne({
      sessionId: sessionId,
      gameType: 'theycame',
      status: { $in: ['waiting', 'active'] }
    });
    
    
    // Find the player's character from the session
    const playerCharacter = session.players.find(p => p.discordId === userId);
    
    if (!playerCharacter) {
      return await interaction.editReply({
        content: `❌ You haven't joined this game session yet. Use \`/minigame theycame-join session_id:${sessionId} character:YourCharacter\` to join first.`
      });
    }
    
    const resolvedCharacterName = playerCharacter.characterName;
    
    // Fetch character
    const { fetchCharacterByNameAndUserId, fetchModCharacterByNameAndUserId } = require('../../database/db');
    let character = await fetchCharacterByNameAndUserId(resolvedCharacterName, userId);
    
    // If not found as regular character, try as mod character
    if (!character) {
      character = await fetchModCharacterByNameAndUserId(resolvedCharacterName, userId);
    }
    
    if (!character) {
      return await interaction.editReply({
        content: `❌ Character "${resolvedCharacterName}" not found or does not belong to you.`
      });
    }
    
    const username = character.name;
    
    if (!target) {
      return await interaction.editReply({
        content: '❌ Please specify target alien (e.g., 1A).'
      });
    }
    
    // Generate random roll (1-6)
    const roll = Math.floor(Math.random() * 6) + 1;
    
    console.log(`[MINIGAME] ${username} rolling against ${target} - Roll: ${roll}`);
    
    // Character is already validated from session lookup above
    
    // Process the roll
    const result = processAlienDefenseRoll(session.gameData, userId, username, target, roll);
    
    console.log(`[MINIGAME] Roll result: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.message}`);
    
    // Save the session data after roll processing (which may have advanced the turn)
    session.markModified('gameData');
    await session.save();
    
    if (result.success) {
      // Create embed for successful roll AFTER saving session to show correct turn order
      const embedResult = await this.createMinigameEmbed(session, 'Defense Roll', character);
      
      // Set color to cyan blue for successful hits
      embedResult.embed.setColor(0x00FFFF); // Cyan blue
      
      // Add roll result to embed description (no advancement messages here)
      let description = embedResult.embed.data.description;
      description += `\n\n__🎯 Roll Result:__\n**${result.message}**`;
      embedResult.embed.setDescription(description);
      
      const replyOptions = {
        embeds: [embedResult.embed]
      };
      if (embedResult.attachment) {
        replyOptions.files = [embedResult.attachment];
      }
      await interaction.editReply(replyOptions);
      
      // Check if we should automatically advance the round AFTER creating the roll result embed
      let advanceResult = null;
      let shouldDelayTurnNotification = false;
      if (result.shouldAdvanceRound) {
        console.log(`[MINIGAME] Advancing round - Current round: ${session.gameData.currentRound}`);
        advanceResult = advanceAlienDefenseRound(session.gameData);
        console.log(`[MINIGAME] Round advanced - New round: ${session.gameData.currentRound} - ${advanceResult.message}`);
        
        // Save the session after round advancement
        session.markModified('gameData');
        await session.save();
        
        // Only proceed with round advancement logic if it was successful
        if (advanceResult.success) {
          // Check if turn order has reset to the first player (turn index 0)
          if (session.gameData.currentTurnIndex === 0) {
            shouldDelayTurnNotification = true;
            console.log(`[MINIGAME] Turn order reset to first player - will delay turn notification until after round embed`);
          }
        }
      }
      
      // Check if game should end BEFORE sending turn notifications
      const gameEndCheck = checkAlienDefenseGameEnd(session.gameData);
      if (gameEndCheck.gameEnded) {
        // Send immediate game over message
        await interaction.followUp({
          content: '🏁 **Game Over! Processing...**'
        });
        
        session.status = 'finished';
        session.results.finalScore = gameEndCheck.finalScore;
        session.results.completedAt = new Date();
        
        // Calculate animals lost for reward distribution
        const animalsLost = GAME_CONFIGS.theycame.startingAnimals - gameEndCheck.finalScore;
        console.log(`[MINIGAME] Game ended - Animals saved: ${gameEndCheck.finalScore}, Animals lost: ${animalsLost}`);
        
        // Distribute rewards to all players
        const rewardResults = await distributeMinigameRewards(session, animalsLost, interaction);
        console.log(`[MINIGAME] Reward distribution completed - Success: ${rewardResults.success}, Players rewarded: ${rewardResults.rewardsGiven.length}`);
        
        // Create special end-game embed for round 8 completion
        const endGameEmbed = await this.createEndGameEmbed(session, gameEndCheck, rewardResults);
        const endGameOptions = {
          embeds: [endGameEmbed.embed]
        };
        if (endGameEmbed.attachment) {
          endGameOptions.files = [endGameEmbed.attachment];
        }
        
        // Post the end-game embed as a follow-up message
        await interaction.followUp(endGameOptions);
      } else {
        // Send turn notification if it's someone else's turn now, unless we need to delay it for new round
        if (!shouldDelayTurnNotification) {
          await this.sendTurnNotification(interaction, session);
        }
      }
      
      
      // If round advanced automatically, post border image first, then delay, then new round embed
      if (advanceResult && advanceResult.success) {
        // Post border image immediately
        const borderEmbed = new EmbedBuilder()
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setColor('#000000'); // Black color for border image
        
        await interaction.followUp({ embeds: [borderEmbed] });
        
        // Wait 5-8 seconds before posting the new round embed
        const delay = 4; // Fixed delay of 4 seconds
        console.log(`[MINIGAME] Waiting ${delay} seconds before posting new round embed...`);
        
        setTimeout(async () => {
          try {
            const roundAdvanceEmbed = await this.createDetailedMinigameEmbed(session, `Round ${session.gameData.currentRound} Advanced!`, null);
            roundAdvanceEmbed.embed.setColor('#FFFFFF'); // White color
            
            // Add movement and spawning information to the round advance embed
            let description = roundAdvanceEmbed.embed.data.description;
            description += `\n\n**${advanceResult.message}**`;
            
            // Add movement messages if any aliens moved
            if (advanceResult.movementMessages && advanceResult.movementMessages.length > 0) {
              description += `\n\n__🔄 Alien Movement:__\n${advanceResult.movementMessages.join(', ')}`;
            }
            
            // Add spawning information if new aliens spawned
            if (advanceResult.spawnLocations && advanceResult.spawnLocations.length > 0) {
              description += `\n\n__👾 New Aliens Spawned:__\n${advanceResult.spawnLocations.join(', ')}`;
            }
            
            roundAdvanceEmbed.embed.setDescription(description);
            
            const roundAdvanceOptions = {
              embeds: [roundAdvanceEmbed.embed]
            };
            if (roundAdvanceEmbed.attachment) {
              roundAdvanceOptions.files = [roundAdvanceEmbed.attachment];
            }
            
            // Post the round advance embed as a follow-up message
            await interaction.followUp(roundAdvanceOptions);
            
            // Send delayed turn notification if we delayed it for new round
            if (shouldDelayTurnNotification) {
              console.log(`[MINIGAME] Sending delayed turn notification after round embed for session ${session.sessionId}`);
              await this.sendTurnNotification(interaction, session);
            }
          } catch (error) {
            console.error('[MINIGAME] Error posting delayed round advance embed:', error);
          }
        }, delay * 1000);
      }
      
      // Update the main game message AFTER the round advancement embed is posted
      await this.updateGameMessage(interaction, session);
    } else {
      // Check if this is a "not your turn" error - use simple embed
      if (result.message.includes("It's not your turn")) {
        const simpleEmbed = createSimpleErrorEmbed(result.message, character.icon);
        return await interaction.editReply({
          embeds: [simpleEmbed]
        });
      }
      
      // Save the session data after roll processing (which may have advanced the turn)
      
      // Create embed for failed roll AFTER saving session to show correct turn order
      const embedResult = await this.createMinigameEmbed(session, 'Defense Roll', character);
      
      // Set color to eye-burning saturated orange for misses
      embedResult.embed.setColor(0xFF4500); // Eye-burning saturated orange
      
      // Add roll result to embed description (no advancement messages here)
      let description = embedResult.embed.data.description;
      description += `\n\n__🎯 Roll Result:__\n**${result.message}**`;
      embedResult.embed.setDescription(description);
      
      const replyOptions = {
        embeds: [embedResult.embed]
      };
      if (embedResult.attachment) {
        replyOptions.files = [embedResult.attachment];
      }
      await interaction.editReply(replyOptions);
      
      // Check if we should automatically advance the round AFTER creating the roll result embed
      let advanceResult = null;
      let shouldDelayTurnNotification = false;
      if (result.shouldAdvanceRound) {
        console.log(`[MINIGAME] Advancing round - Current round: ${session.gameData.currentRound}`);
        advanceResult = advanceAlienDefenseRound(session.gameData);
        console.log(`[MINIGAME] Round advanced - New round: ${session.gameData.currentRound} - ${advanceResult.message}`);
        
        // Save the session after round advancement
        session.markModified('gameData');
        await session.save();
        
        // Only proceed with round advancement logic if it was successful
        if (advanceResult.success) {
          // Check if turn order has reset to the first player (turn index 0)
          if (session.gameData.currentTurnIndex === 0) {
            shouldDelayTurnNotification = true;
            console.log(`[MINIGAME] Turn order reset to first player - will delay turn notification until after round embed`);
          }
        }
      }
      
      // Check if game should end BEFORE sending turn notifications
      const gameEndCheck = checkAlienDefenseGameEnd(session.gameData);
      if (gameEndCheck.gameEnded) {
        // Send immediate game over message
        await interaction.followUp({
          content: '🏁 **Game Over! Processing...**'
        });
        
        session.status = 'finished';
        session.results.finalScore = gameEndCheck.finalScore;
        session.results.completedAt = new Date();
        
        // Calculate animals lost for reward distribution
        const animalsLost = GAME_CONFIGS.theycame.startingAnimals - gameEndCheck.finalScore;
        console.log(`[MINIGAME] Game ended - Animals saved: ${gameEndCheck.finalScore}, Animals lost: ${animalsLost}`);
        
        // Distribute rewards to all players
        const rewardResults = await distributeMinigameRewards(session, animalsLost, interaction);
        console.log(`[MINIGAME] Reward distribution completed - Success: ${rewardResults.success}, Players rewarded: ${rewardResults.rewardsGiven.length}`);
        
        // Create special end-game embed for round 8 completion
        const endGameEmbed = await this.createEndGameEmbed(session, gameEndCheck, rewardResults);
        const endGameOptions = {
          embeds: [endGameEmbed.embed]
        };
        if (endGameEmbed.attachment) {
          endGameOptions.files = [endGameEmbed.attachment];
        }
        
        // Post the end-game embed as a follow-up message
        await interaction.followUp(endGameOptions);
      } else {
        // Send turn notification if it's someone else's turn now, unless we need to delay it for new round
        if (!shouldDelayTurnNotification) {
          await this.sendTurnNotification(interaction, session);
        }
      }
      
      
      // If round advanced automatically, post border image first, then delay, then new round embed
      if (advanceResult && advanceResult.success) {
        // Post border image immediately
        const borderEmbed = new EmbedBuilder()
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setColor('#000000'); // Black color for border image
        
        await interaction.followUp({ embeds: [borderEmbed] });
        
        // Wait 5-8 seconds before posting the new round embed
        const delay = 4; // Fixed delay of 4 seconds
        console.log(`[MINIGAME] Waiting ${delay} seconds before posting new round embed...`);
        
        setTimeout(async () => {
          try {
            const roundAdvanceEmbed = await this.createDetailedMinigameEmbed(session, `Round ${session.gameData.currentRound} Advanced!`, null);
            roundAdvanceEmbed.embed.setColor('#FFFFFF'); // White color
            
            // Add movement and spawning information to the round advance embed
            let description = roundAdvanceEmbed.embed.data.description;
            description += `\n\n**${advanceResult.message}**`;
            
            // Add movement messages if any aliens moved
            if (advanceResult.movementMessages && advanceResult.movementMessages.length > 0) {
              description += `\n\n__🔄 Alien Movement:__\n${advanceResult.movementMessages.join(', ')}`;
            }
            
            // Add spawning information if new aliens spawned
            if (advanceResult.spawnLocations && advanceResult.spawnLocations.length > 0) {
              description += `\n\n__👾 New Aliens Spawned:__\n${advanceResult.spawnLocations.join(', ')}`;
            }
            
            roundAdvanceEmbed.embed.setDescription(description);
            
            const roundAdvanceOptions = {
              embeds: [roundAdvanceEmbed.embed]
            };
            if (roundAdvanceEmbed.attachment) {
              roundAdvanceOptions.files = [roundAdvanceEmbed.attachment];
            }
            
            // Post the round advance embed as a follow-up message
            await interaction.followUp(roundAdvanceOptions);
            
            // Send delayed turn notification if we delayed it for new round
            if (shouldDelayTurnNotification) {
              console.log(`[MINIGAME] Sending delayed turn notification after round embed for session ${session.sessionId}`);
              await this.sendTurnNotification(interaction, session);
            }
          } catch (error) {
            console.error('[MINIGAME] Error posting delayed round advance embed:', error);
          }
        }, delay * 1000);
      }
      
      // Update the main game message AFTER the round advancement embed is posted
      await this.updateGameMessage(interaction, session);
    }
  },


  // ============================================================================
  // ------------------- Helper Functions -------------------
  // ============================================================================
  
  async sendTurnNotification(interaction, session) {
    // Only send notification if there are players and it's not the same player's turn
    if (session.gameData.turnOrder && session.gameData.turnOrder.length > 0) {
      const currentPlayer = session.gameData.turnOrder[session.gameData.currentTurnIndex];
      const currentUserId = interaction.user.id;
      
      console.log(`[MINIGAME] Turn notification check - Session: ${session.sessionId}, Current Player: ${currentPlayer.username} (${currentPlayer.discordId}), Interaction User: ${interaction.user.username} (${currentUserId}), Turn Index: ${session.gameData.currentTurnIndex}`);
      
      // Only send notification if it's someone else's turn
      if (currentPlayer.discordId !== currentUserId) {
        try {
          console.log(`[MINIGAME] Sending turn notification to ${currentPlayer.username} (${currentPlayer.discordId}) for session ${session.sessionId}`);
          
          await interaction.followUp({
            content: `🎯 <@${currentPlayer.discordId}>, it's your turn! Use </minigame theycame-roll:1413815457118556201> to attack aliens!`,
            allowedMentions: {
              users: [currentPlayer.discordId]
            }
          });
          
          console.log(`[MINIGAME] Successfully sent turn notification to ${currentPlayer.username} for session ${session.sessionId}`);
        } catch (error) {
          console.error(`[MINIGAME] Error sending turn notification to ${currentPlayer.username} for session ${session.sessionId}:`, error);
        }
      } else {
        console.log(`[MINIGAME] Skipping turn notification - same player (${currentPlayer.username}) is taking the turn`);
      }
    } else {
      console.log(`[MINIGAME] No turn order available for session ${session.sessionId} - skipping turn notification`);
    }
  },
  
  async createJoinEmbed(session, character, joinMessage) {
    const gameConfig = GAME_CONFIGS.theycame;
    const status = getAlienDefenseGameStatus(session.gameData);
    const availableSlots = gameConfig.maxPlayers - session.players.length;
    
    // Create player list with character names
    const playerList = session.players.length > 0 
      ? session.players.map(p => `• **${p.characterName}**`).join('\n')
      : '*No defenders joined yet*';
    
    // Generate overlay image with aliens
    const overlayImage = await generateAlienOverlayImage(session.gameData, session.sessionId);
    
    const villageDisplayName = session.village ? session.village.charAt(0).toUpperCase() + session.village.slice(1) : 'Village';
    const villageEmoji = session.village ? getVillageEmojiByName(session.village) || '' : '';
    const embed = new EmbedBuilder()
      .setTitle(`🎮 ${character.name} joined the ${villageDisplayName} alien defense!`)
      .setDescription(`*Defend your village from alien invaders! Work together to protect the livestock.*`)
      .setColor(0x00ff00) // Green for join success
      .setTimestamp()
      .setThumbnail(character.icon) // Add character icon as thumbnail
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
    
    // Game status - better organized
    const gameStatusText = session.status === 'waiting' ? '⏳ Waiting for players' : 
                          session.status === 'active' ? '⚔️ In Progress' : '🏁 Finished';
    
    embed.addFields(
      { 
        name: '🎯 Join the Defense', 
        value: `**${availableSlots} more slots available!**\n\n</minigame theycame-join:1413815457118556201>`, 
        inline: false 
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
        turnOrderValue += `\n\n**🎯 Use </minigame theycame-roll:1413815457118556201> to go!**`;
      }
      
      embed.addFields(
        { 
          name: '__👥 Defenders & Turn Order__', 
          value: `**${session.players.length}/${gameConfig.maxPlayers} players**\n${turnOrderValue}`, 
          inline: false 
        }
      );
    }
    
    embed.setFooter({ text: '🎮 Use /minigame theycame-join to join the defense! • Good luck protecting the village!' });
    
    // Return both embed and attachment
    return {
      embed: embed,
      attachment: overlayImage
    };
  },
  
  async updateGameMessage(interaction, session) {
    try {
      if (!session.messageId) return;
      
      const channel = interaction.client.channels.cache.get(session.channelId);
      if (!channel) return;
      
      const message = await channel.messages.fetch(session.messageId);
      if (!message) return;
      
      const result = await this.createMinigameEmbed(session, 'Game Status');
      
      const editOptions = {
        embeds: [message.embeds[0], result.embed] // Keep instructions embed, update game status
      };
      if (result.attachment) {
        editOptions.files = [result.attachment];
      }
      
      await message.edit(editOptions);
    } catch (error) {
      console.error('Failed to update game message:', error);
    }
  },

  // ============================================================================
  // ------------------- Embed Creation -------------------
  // ============================================================================
  
  async createDetailedMinigameEmbed(session, title, character = null) {
    const gameConfig = GAME_CONFIGS.theycame;
    const status = getAlienDefenseGameStatus(session.gameData);
    
    // Create player list with character names
    const playerList = session.players.length > 0 
      ? session.players.map(p => `• **${p.characterName}**`).join('\n')
      : '*No defenders joined yet*';
    
    // Generate overlay image with aliens
    const overlayImage = await generateAlienOverlayImage(session.gameData, session.sessionId);
    
    const villageDisplayName = session.village ? session.village.charAt(0).toUpperCase() + session.village.slice(1) : 'Village';
    const villageEmoji = session.village ? getVillageEmojiByName(session.village) || '' : '';
    const embed = new EmbedBuilder()
      .setTitle(`👽 ${gameConfig.name} - ${villageDisplayName} Village - ${title}`)
      .setDescription('*Defend your village from alien invaders! Work together to protect the livestock.*')
      .setColor(this.getGameStatusColor(session.status))
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
    
    embed.addFields(
      { 
        name: '__📊 Game Status__', 
        value: `**Session:** ${session.sessionId}\n**${status.gameProgress}** • ${gameStatusText}`, 
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
  },
  
  async createMinigameEmbed(session, title, character = null) {
    const gameConfig = GAME_CONFIGS.theycame;
    const status = getAlienDefenseGameStatus(session.gameData);
    
    // Create player list with character names
    const playerList = session.players.length > 0 
      ? session.players.map(p => `• **${p.characterName}**`).join('\n')
      : '*No defenders joined yet*';
    
    // Create alien status with better formatting
    const alienStatus = `**Outer Ring:** ${status.ringStatus.outerRing} aliens\n**Middle Ring:** ${status.ringStatus.middleRing} aliens\n**Inner Ring:** ${status.ringStatus.innerRing} aliens`;
    
    // Generate overlay image with aliens
    const overlayImage = await generateAlienOverlayImage(session.gameData, session.sessionId);
    
    const villageDisplayName = session.village ? session.village.charAt(0).toUpperCase() + session.village.slice(1) : 'Village';
    const villageEmoji = session.village ? getVillageEmojiByName(session.village) || '' : '';
    const embed = new EmbedBuilder()
      .setTitle(`👽 ${gameConfig.name} - ${villageDisplayName} Village - ${title}`)
      .setDescription('*Defend your village from alien invaders! Work together to protect the livestock.*')
      .setColor(this.getGameStatusColor(session.status))
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
    
    // Game progress and status - cleaner layout
    const gameStatusText = session.status === 'waiting' ? '⏳ Waiting for players' : 
                          session.status === 'active' ? '⚔️ In Progress' : '🏁 Finished';
    
    embed.addFields(
      { 
        name: '📊 Game Status', 
        value: `**Session:** ${session.sessionId}\n__${status.gameProgress} • ${gameStatusText}__`, 
        inline: false 
      }
    );
    
    // Combined defenders and turn order info - only show if there are players
    if (session.gameData.turnOrder && session.gameData.turnOrder.length > 0) {
      const turnOrderText = session.gameData.turnOrder.map((player, index) => 
        `${index === session.gameData.currentTurnIndex ? '➤' : '•'} **${player.username}**${index === session.gameData.currentTurnIndex ? ' *(Current Turn)*' : ''}`
      ).join('\n');
      
      embed.addFields(
        { 
          name: '__👥 Defenders & Turn Order__', 
          value: `**${session.players.length} player${session.players.length !== 1 ? 's' : ''}**\n${turnOrderText}`, 
          inline: false 
        }
      );
    }
    
    // Add ring difficulty info and command instruction for active games
    if (session.status === 'active') {
      embed.addFields(
        { 
          name: '__🎯 Take Your Turn__', 
          value: `**Use </minigame theycame-roll:1413815457118556201> to attack aliens!**`, 
          inline: false 
        },
        { 
          name: '__⚔️ Ring Difficulties__', 
          value: `• **Outer Ring** - **5-6** to hit\n• **Middle Ring** - **4-6** to hit\n• **Inner Ring** - **3-6** to hit`, 
          inline: false 
        }
      );
    }
    
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
  },

  getGameStatusColor(status) {
    switch (status) {
      case 'waiting': return 0x00ff00; // Green
      case 'active': return 0xffff00; // Yellow
      case 'finished': return 0xff0000; // Red
      default: return 0x808080; // Gray
    }
  },

  // ============================================================================
  // ------------------- End Game Embed Creation -------------------
  // ============================================================================
  
  async createEndGameEmbed(session, gameEndCheck, rewardResults = null) {
    const gameConfig = GAME_CONFIGS.theycame;
    const status = getAlienDefenseGameStatus(session.gameData);
    
    // Generate overlay image with aliens (final state)
    const overlayImage = await generateAlienOverlayImage(session.gameData, session.sessionId);
    
    const villageDisplayName = session.village ? session.village.charAt(0).toUpperCase() + session.village.slice(1) : 'Village';
    const embed = new EmbedBuilder()
      .setTitle(`👽 ${gameConfig.name} - ${villageDisplayName} Village - GAME OVER!`)
      .setDescription('*The alien invasion has ended! The village defense is complete.*')
      .setColor(0x00FF00) // Bright alien green color
      .setTimestamp()
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
    
    // Add the overlay image if available, otherwise fallback to village image
    if (overlayImage) {
      embed.setImage(`attachment://minigame-${session.sessionId}-overlay.png`);
    } else {
      const villageImage = session.gameData?.images?.village || getCurrentVillageImage();
      embed.setImage(villageImage);
    }
    
    // Final game results
    const animalsSaved = session.results.finalScore;
    const totalAnimals = GAME_CONFIGS.theycame.startingAnimals;
    const percentage = Math.round((animalsSaved / totalAnimals) * 100);
    const animalsLost = totalAnimals - animalsSaved;
    
    embed.addFields(
      { 
        name: '🏁 **GAME COMPLETE**', 
        value: `**Status:** FINISHED • **Rounds:** ${session.gameData.currentRound}/${session.gameData.maxRounds}`, 
        inline: false 
      },
      { 
        name: '__🐄 Final Village Status__', 
        value: `**${animalsSaved}/${totalAnimals}** animals saved (${percentage}%)\n**${animalsLost}** animals lost to aliens`, 
        inline: true 
      },
      { 
        name: '__👾 Alien Defense Stats__', 
        value: `**${status.defeatedAliens}** aliens defeated\n**${status.animalsLost}** animals stolen`, 
        inline: true 
      }
    );
    
    // Player participation summary
    if (session.players.length > 0) {
      const playerList = session.players.map(p => `• **${p.characterName}**`).join('\n');
      embed.addFields(
        { 
          name: '__👥 Defenders__', 
          value: `**${session.players.length} player${session.players.length !== 1 ? 's' : ''}** participated:\n${playerList}`, 
          inline: false 
        }
      );
    }
    
    // Rewards section
    if (rewardResults && rewardResults.rewardsGiven.length > 0) {
      const rewardsText = rewardResults.rewardsGiven.map(player => {
        const rewardList = player.rewards.map(r => `${r.quantity}x ${r.name}`).join(', ');
        return `• **${player.characterName}**: ${rewardList}`;
      }).join('\n');
      
      embed.addFields(
        { 
          name: '__🎁 Rewards Distributed__', 
          value: rewardsText, 
          inline: false 
        }
      );
      
      // Add error messages if any
      if (rewardResults.errors && rewardResults.errors.length > 0) {
        embed.addFields(
          { 
            name: '__⚠️ Reward Errors__', 
            value: rewardResults.errors.slice(0, 5).join('\n'), // Limit to first 5 errors
            inline: false 
          }
        );
      }
    }
    
    // Game end message
    embed.addFields(
      { 
        name: '__🎯 Final Result__', 
        value: gameEndCheck.message, 
        inline: false 
      }
    );
    
    embed.setFooter({ text: '🎮 Game Complete! No more rolls allowed. • Thanks for defending the village! 🛡️' });
    
    // Return both embed and attachment
    return {
      embed: embed,
      attachment: overlayImage
    };
  }
};