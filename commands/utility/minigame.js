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
const logger = require('../../utils/logger');
const Minigame = require('../../models/MinigameModel');
const Character = require('../../models/CharacterModel');
const User = require('../../models/UserModel');
const { generateUniqueId } = require('../../utils/uniqueIdUtils');
const { handleInteractionError } = require('../../utils/globalErrorHandler');
const { getVillageEmojiByName } = require('../../modules/locationsModule');

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
            .setDescription('Quest ID - required for quest participation, or use RINGER to join as backup')
            .setRequired(true)
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
    const username = interaction.user.username;
    
    console.log(`[MINIGAME JOIN] ${username} (${userId}) attempting to join session with character "${resolvedCharacterName}"`);
    
    // Extract session ID from the full display text if needed
    // Handle cases where sessionId might be "⚔ A868409 | 4 players | Created: 9/7/2025"
    const sessionIdMatch = sessionId.match(/A\d+/);
    if (sessionIdMatch) {
      sessionId = sessionIdMatch[0];
    }
    
    console.log(`[MINIGAME JOIN] Extracted session ID: ${sessionId}`);
    
    // Defer reply to prevent interaction timeout
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
      console.log(`[MINIGAME JOIN] Deferred reply for ${username}`);
    }
    
    // Validate character name
    if (!resolvedCharacterName) {
      console.log(`[MINIGAME JOIN] ${username} failed validation - no character name provided`);
      return await interaction.editReply({
        content: '❌ Please specify a character name to join.'
      });
    }
    
    console.log(`[MINIGAME JOIN] ${username} validating character "${resolvedCharacterName}"`);
    
    // Validate quest participation - quest ID is now required
    console.log(`[MINIGAME JOIN] ${username} validating quest participation for quest ID: ${questId}`);
    
    // Special case for testing - allow "TEST" quest ID to bypass validation
    // Special case for RINGER - allow non-quest participants to join as backup
    if (questId === 'TEST') {
      console.log(`[MINIGAME JOIN] ${username} using TEST quest ID - bypassing quest validation`);
    } else if (questId === 'RINGER') {
      console.log(`[MINIGAME JOIN] ${username} using RINGER - joining as backup player`);
    } else {
      const Quest = require('../../models/QuestModel');
      const quest = await Quest.findOne({ questID: questId });
      
      if (!quest) {
        console.log(`[MINIGAME JOIN] ${username} failed validation - quest not found: ${questId}`);
        
        // Create helpful error embed
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Quest Not Found')
          .setDescription(`Quest with ID **"${questId}"** could not be found in the database.`)
          .setColor('#FF0000')
          .setThumbnail('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .addFields(
            {
              name: '🔍 What you might be doing wrong:',
              value: `• **Typo in Quest ID** - Double-check the quest ID spelling\n• **Quest doesn't exist** - The quest may have been deleted or expired\n• **Wrong format** - Quest IDs are usually longer strings (e.g., "ABC123", "QUEST001")\n• **Case sensitivity** - Quest IDs are case-sensitive`,
              inline: false
            },
            {
              name: '✅ How to fix this:',
              value: `• Check the quest ID with the quest creator\n• Use \`/quest list\` to see available quests\n• For testing, use \`questid:TEST\` to bypass quest validation\n• To join as backup, use \`questid:RINGER\``,
              inline: false
            },
            {
              name: '🎮 Testing Mode:',
              value: `If you're testing the minigame, use:\n\`/minigame theycame-join session_id:${sessionId} character:${resolvedCharacterName} questid:TEST\``,
              inline: false
            },
            {
              name: '🆘 Backup Player:',
              value: `To join as a backup player (RINGER), use:\n\`/minigame theycame-join session_id:${sessionId} character:${resolvedCharacterName} questid:RINGER\``,
              inline: false
            }
          )
          .setFooter({ text: 'Need help? Contact a moderator or quest creator.' })
          .setTimestamp();
          
        return await interaction.editReply({
          embeds: [errorEmbed]
        });
      }
      
      if (!quest.participants.has(userId)) {
        console.log(`[MINIGAME JOIN] ${username} failed validation - not a quest participant`);
        return await interaction.editReply({
          content: `❌ You must first join the quest "${quest.title}" before participating in the minigame. Use /quest join questid:${questId} charactername:${resolvedCharacterName}`
        });
      }
      
      // Verify the character matches the quest participant
      const participant = quest.participants.get(userId);
      if (participant.characterName !== resolvedCharacterName) {
        console.log(`[MINIGAME JOIN] ${username} failed validation - character mismatch. Quest character: ${participant.characterName}, Provided: ${resolvedCharacterName}`);
        // Create quest participation error embed
        const { createBaseEmbed, addQuestInfoFields } = require('../../modules/questRewardModule');
        const errorEmbed = createBaseEmbed(
          '❌ Character Mismatch',
          `You are participating in this quest with character **"${participant.characterName}"**, not **"${resolvedCharacterName}"**.`,
          0xff0000 // Error color
        );
        
        // Add quest information fields
        addQuestInfoFields(errorEmbed, quest, [
          { name: 'Correct Character', value: `**${participant.characterName}**`, inline: true },
          { name: 'Provided Character', value: `~~${resolvedCharacterName}~~`, inline: true }
        ]);
        
        // Add helpful information
        errorEmbed.addFields({
          name: '💡 What to do next',
          value: 'Make sure you are using the correct character name when joining quest activities.',
          inline: false
        });
        
        return await interaction.editReply({ embeds: [errorEmbed] });
      }
    }
    console.log(`[MINIGAME JOIN] ${username} quest validation passed`);
    
    // Fetch character
    console.log(`[MINIGAME JOIN] ${username} fetching character "${resolvedCharacterName}" from database`);
    const { fetchCharacterByNameAndUserId, fetchModCharacterByNameAndUserId } = require('../../database/db');
    let character = await fetchCharacterByNameAndUserId(resolvedCharacterName, userId);
    
    // If not found as regular character, try as mod character
    if (!character) {
      console.log(`[MINIGAME JOIN] ${username} character not found as regular character, trying mod character`);
      character = await fetchModCharacterByNameAndUserId(resolvedCharacterName, userId);
    }
    
    if (!character) {
      console.log(`[MINIGAME JOIN] ${username} failed validation - character not found: "${resolvedCharacterName}"`);
      return await interaction.editReply({
        content: `❌ Character "${resolvedCharacterName}" not found or does not belong to you.`
      });
    }
    
    console.log(`[MINIGAME JOIN] ${username} character found: ${character.name} (ID: ${character._id})`);
    
    // Check session with detailed error messages
    console.log(`[MINIGAME JOIN] ${username} validating session ${sessionId}`);
    const sessionError = await getSessionDiagnosticMessage(sessionId);
    if (sessionError) {
      console.log(`[MINIGAME JOIN] ${username} session validation failed: ${sessionError}`);
      return await interaction.editReply({
        content: sessionError
      });
    }
    
    // Find the specific session (we know it exists and is valid now)
    console.log(`[MINIGAME JOIN] ${username} fetching session from database`);
    const session = await Minigame.findOne({
      sessionId: sessionId,
      gameType: 'theycame',
      status: { $in: ['waiting', 'active'] }
    });
    
    if (!session) {
      console.log(`[MINIGAME JOIN] ${username} session not found in database after validation - possible race condition`);
      return await interaction.editReply({
        content: `❌ Session ${sessionId} not found or no longer available.`
      });
    }
    
    console.log(`[MINIGAME JOIN] ${username} session found - Status: ${session.status}, Players: ${session.players.length}, Village: ${session.village}`);
    
    // Check if character is in the correct village for this minigame
    console.log(`[MINIGAME JOIN] ${username} checking village location - Character: ${character.currentVillage}, Session: ${session.village}`);
    if (session.village && character.currentVillage !== session.village) {
      console.log(`[MINIGAME JOIN] ${username} failed validation - wrong village location`);
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
    console.log(`[MINIGAME JOIN] ${username} checking for duplicate players - Current players: ${session.players.map(p => p.characterName).join(', ')}`);
    const alreadyJoined = session.players.find(p => p.characterId === character._id.toString());
    if (alreadyJoined) {
      console.log(`[MINIGAME JOIN] ${username} failed validation - character already joined`);
      return await interaction.editReply({
        content: `✅ **${character.name}** is already in the game!`
      });
    }
    
    // Add character to game - Critical section with race condition protection
    console.log(`[MINIGAME JOIN] ${username} adding character to game - Players before: ${session.players.length}`);
    
    // Double-check for duplicates right before adding (race condition protection)
    const duplicateCheck = session.players.find(p => p.characterId === character._id.toString());
    if (duplicateCheck) {
      console.log(`[MINIGAME JOIN] ${username} race condition detected - character already joined during processing`);
      return await interaction.editReply({
        content: `✅ **${character.name}** is already in the game!`
      });
    }
    
    session.players.push({
      discordId: userId,
      characterName: character.name,
      characterId: character._id.toString(),
      isModCharacter: character.isModCharacter || false,
      isRinger: questId === 'RINGER',
      joinedAt: new Date()
    });
    console.log(`[MINIGAME JOIN] ${username} character added to players array - Players after: ${session.players.length}`);
    
    // Add player to turn order
    console.log(`[MINIGAME JOIN] ${username} adding to turn order`);
    const result = addPlayerToTurnOrder(session.gameData, userId, username);
    console.log(`[MINIGAME JOIN] ${username} turn order result: ${result.message}`);
    
    // Check if we have 6 players and should auto-start BEFORE saving
    let shouldAutoStart = session.players.length === 6 && session.status === 'waiting';
    let spawnResult = null;
    
    if (shouldAutoStart) {
      console.log(`[MINIGAME JOIN] ${username} triggering auto-start - 6 players reached for session ${session.sessionId}`);
      
      // Auto-start the game
      const { spawnAliens } = require('../../modules/minigameModule');
      const playerCount = session.gameData.turnOrder.length || session.players.length;
      console.log(`[MINIGAME JOIN] ${username} spawning aliens for auto-start - Player count: ${playerCount}`);
      spawnResult = spawnAliens(session.gameData, playerCount, 0); // Pass 0 for first turn
      console.log(`[MINIGAME JOIN] ${username} aliens spawned: ${spawnResult.spawnCount} aliens`);
      
      // Update session status
      session.gameData.currentRound = 1;
      session.status = 'active';
      console.log(`[MINIGAME JOIN] ${username} session status updated to active`);
    }
    
    // Save session to database (single save for both join and auto-start)
    console.log(`[MINIGAME JOIN] ${username} saving session to database`);
    session.markModified('gameData');
    session.markModified('gameData.aliens');
    session.markModified('gameData.turnOrder');
    session.markModified('gameData.currentTurnIndex');
    session.markModified('players');
    
    try {
      await session.save();
      console.log(`[MINIGAME JOIN] ${username} session saved successfully`);
      
      // Debug: Verify aliens are still in the session after save
      if (shouldAutoStart) {
        console.log(`[MINIGAME JOIN] ${username} DEBUG - Aliens after save:`, session.gameData.aliens.map(a => `${a.id}(${a.ring}${a.segment})`));
        console.log(`[MINIGAME JOIN] ${username} DEBUG - Active aliens after save:`, session.gameData.aliens.filter(a => !a.defeated).map(a => `${a.id}(${a.ring}${a.segment})`));
      }
    } catch (error) {
      console.error(`[MINIGAME JOIN] ${username} failed to save session:`, error);
      return await interaction.editReply({
        content: `❌ Failed to join the game. Please try again.`
      });
    }
    
    // Update the game message
    console.log(`[MINIGAME JOIN] ${username} updating game message`);
    await this.updateGameMessage(interaction, session);
    
    // Create join confirmation embed
    console.log(`[MINIGAME JOIN] ${username} creating join confirmation embed`);
    const embedResult = await this.createJoinEmbed(session, character, result.message, questId);
    const replyOptions = {
      embeds: [embedResult.embed]
    };
    if (embedResult.attachment) {
      replyOptions.files = [embedResult.attachment];
    }
    
    await interaction.editReply(replyOptions);
    console.log(`[MINIGAME JOIN] ${username} join process completed successfully`);
    
    // Handle auto-start follow-up message if needed
    if (shouldAutoStart) {
      
      // Update the game message
      console.log(`[MINIGAME JOIN] ${username} updating game message for auto-start`);
      await this.updateGameMessage(interaction, session);
      
      // Get first player in turn order for mention
      const firstPlayer = session.gameData.turnOrder[0];
      const firstPlayerMention = firstPlayer ? `<@${firstPlayer.discordId}>` : '';
      const firstPlayerCharacter = session.players.find(p => p.discordId === firstPlayer?.discordId);
      const firstPlayerCharacterName = firstPlayerCharacter ? firstPlayerCharacter.characterName : firstPlayer?.username || 'None';
      console.log(`[MINIGAME JOIN] ${username} first player: ${firstPlayerCharacterName}`);
      
      // Create auto-start embed (like start game embed)
      console.log(`[MINIGAME JOIN] ${username} creating auto-start embed`);
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
      console.log(`[MINIGAME JOIN] ${username} auto-start process completed successfully`);
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
        content: `❌ You haven't joined this game session yet. Use \`/minigame theycame-join session_id:${sessionId} character:YourCharacter questid:QuestID\` to join first.`
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
    
    logger.info('MINIGAME', `${username} rolling against ${target} - Roll: ${roll}`);
    
    // Character is already validated from session lookup above
    
    // Process the roll
    const result = processAlienDefenseRoll(session.gameData, userId, username, target, roll);
    
    logger.info('MINIGAME', `Roll result: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.message}`);
    logger.debug('MINIGAME', `Aliens before save: ${session.gameData.aliens.map(a => `${a.id}(${a.ring}${a.segment})`).join(', ')}`);
    
    // Check if game ended immediately from this roll
    if (result.gameEnded) {
      logger.info('MINIGAME', `Game ended immediately from roll - ${result.gameEndResult.message}`);
      
      // Save the session data
      session.markModified('gameData');
      session.markModified('gameData.aliens');
      await session.save();
      
      // Calculate quick stats for immediate display
      const animalsSaved = result.gameEndResult.finalScore;
      const totalAnimals = GAME_CONFIGS.theycame.startingAnimals;
      const animalsLost = totalAnimals - animalsSaved;
      const percentage = Math.round((animalsSaved / totalAnimals) * 100);
      const aliensDefeated = session.gameData.aliens.filter(a => a.defeated).length;
      
      // Send immediate game over message with key stats
      await interaction.editReply({
        content: `🏁 **Game Over!** Processing results...\n\n🐄 **Animals Saved:** ${animalsSaved}/${totalAnimals} (${percentage}%)\n👾 **Aliens Defeated:** ${aliensDefeated}\n⏱️ **Rounds Completed:** ${session.gameData.currentRound}/${session.gameData.maxRounds}`
      });
      
      session.status = 'finished';
      session.results.finalScore = result.gameEndResult.finalScore;
      session.results.completedAt = new Date();
      
      // Save the completed game to database
      session.markModified('status');
      session.markModified('results');
      session.markModified('results.finalScore');
      session.markModified('results.completedAt');
      session.markModified('gameData');
      session.markModified('gameData.villageAnimals');
      
      try {
        await session.save();
        logger.success('MINIGAME', `Game completion saved to database - Session ${session.sessionId} marked as finished`);
      } catch (error) {
        console.error(`[MINIGAME] Failed to save game completion to database:`, error);
      }
      
      // Create and post the final end-game embed
      const endGameEmbed = await this.createEndGameEmbed(session, result.gameEndResult);
      const endGameOptions = {
        embeds: [endGameEmbed.embed]
      };
      if (endGameEmbed.attachment) {
        endGameOptions.files = [endGameEmbed.attachment];
      }
      
      // Post the final embed after a short delay
      setTimeout(async () => {
        try {
          await interaction.followUp(endGameOptions);
        } catch (error) {
          console.error(`[MINIGAME] Failed to post end-game embed:`, error);
        }
      }, 2000); // 2 second delay to let the quick stats message show first
      
      logger.info('MINIGAME', `Game ended - Animals saved: ${animalsSaved}, Animals lost: ${animalsLost}`);
      return;
    }
    
    // Save the session data after roll processing (which may have advanced the turn)
    // Explicitly mark the aliens array as modified to ensure Mongoose detects the change
    session.markModified('gameData');
    session.markModified('gameData.aliens');
    session.markModified('gameData.turnOrder');
    session.markModified('gameData.currentTurnIndex');
    await session.save();
    
    logger.debug('MINIGAME', `Aliens after save: ${session.gameData.aliens.map(a => `${a.id}(${a.ring}${a.segment})`).join(', ')}`);
    
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
        logger.info('MINIGAME', `Advancing round - Current round: ${session.gameData.currentRound}`);
        advanceResult = advanceAlienDefenseRound(session.gameData);
        logger.info('MINIGAME', `Round advanced - New round: ${session.gameData.currentRound} - ${advanceResult.message}`);
        
        // Save the session after round advancement
        session.markModified('gameData');
        await session.save();
        
        // Check if the round advancement ended the game
        if (advanceResult.gameEnded) {
          logger.info('MINIGAME', `Game ended from round advancement - ${advanceResult.message}`);
          
          // Calculate quick stats for immediate display
          const animalsSaved = session.gameData.villageAnimals;
          const totalAnimals = GAME_CONFIGS.theycame.startingAnimals;
          const animalsLost = totalAnimals - animalsSaved;
          const percentage = Math.round((animalsSaved / totalAnimals) * 100);
          const aliensDefeated = session.gameData.aliens.filter(a => a.defeated).length;
          
          // Send immediate game over message with key stats
          await interaction.followUp({
            content: `🏁 **Game Over!** Processing results...\n\n🐄 **Animals Saved:** ${animalsSaved}/${totalAnimals} (${percentage}%)\n👾 **Aliens Defeated:** ${aliensDefeated}\n⏱️ **Rounds Completed:** ${session.gameData.currentRound}/${session.gameData.maxRounds}`
          });
          
          session.status = 'finished';
          session.results.finalScore = animalsSaved;
          session.results.completedAt = new Date();
          
          // Save the completed game to database
          session.markModified('status');
          session.markModified('results');
          session.markModified('results.finalScore');
          session.markModified('results.completedAt');
          session.markModified('gameData');
          session.markModified('gameData.villageAnimals');
          
          try {
            await session.save();
            logger.success('MINIGAME', `Game completion saved to database - Session ${session.sessionId} marked as finished`);
          } catch (error) {
            console.error(`[MINIGAME] Failed to save game completion to database:`, error);
          }
          
          // Create and post the final end-game embed
          const endGameEmbed = await this.createEndGameEmbed(session, { 
            finalScore: animalsSaved, 
            message: advanceResult.message 
          });
          const endGameOptions = {
            embeds: [endGameEmbed.embed]
          };
          if (endGameEmbed.attachment) {
            endGameOptions.files = [endGameEmbed.attachment];
          }
          
          // Post the final embed after a short delay
          setTimeout(async () => {
            try {
              await interaction.followUp(endGameOptions);
            } catch (error) {
              console.error(`[MINIGAME] Failed to post end-game embed:`, error);
            }
          }, 2000); // 2 second delay to let the quick stats message show first
          
          logger.info('MINIGAME', `Game ended - Animals saved: ${animalsSaved}, Animals lost: ${animalsLost}`);
          return;
        }
        
        // Only proceed with round advancement logic if it was successful
        if (advanceResult.success) {
          // Check if turn order has reset to the first player (turn index 0)
          if (session.gameData.currentTurnIndex === 0) {
            shouldDelayTurnNotification = true;
            logger.debug('MINIGAME', 'Turn order reset to first player - will delay turn notification until after round embed');
          }
        }
      }
      
      // Check if game should end BEFORE sending turn notifications
      const gameEndCheck = checkAlienDefenseGameEnd(session.gameData);
      if (gameEndCheck.gameEnded) {
        // Calculate quick stats for immediate display
        const animalsSaved = gameEndCheck.finalScore;
        const totalAnimals = GAME_CONFIGS.theycame.startingAnimals;
        const animalsLost = totalAnimals - animalsSaved;
        const percentage = Math.round((animalsSaved / totalAnimals) * 100);
        const aliensDefeated = session.gameData.aliens.filter(a => a.defeated).length;
        
        // Send immediate game over message with key stats
        await interaction.followUp({
          content: `🏁 **Game Over!** Processing results...\n\n🐄 **Animals Saved:** ${animalsSaved}/${totalAnimals} (${percentage}%)\n👾 **Aliens Defeated:** ${aliensDefeated}\n⏱️ **Rounds Completed:** ${session.gameData.currentRound}/${session.gameData.maxRounds}`
        });
        
        session.status = 'finished';
        session.results.finalScore = gameEndCheck.finalScore;
        session.results.completedAt = new Date();
        
        // Save the completed game to database
        session.markModified('status');
        session.markModified('results');
        session.markModified('results.finalScore');
        session.markModified('results.completedAt');
        session.markModified('gameData');
        session.markModified('gameData.villageAnimals');
        
        try {
          await session.save();
          logger.success('MINIGAME', `Game completion saved to database - Session ${session.sessionId} marked as finished`);
          
        } catch (error) {
          console.error(`[MINIGAME] Failed to save game completion to database:`, error);
        }
        
        // Use already calculated animalsLost variable
        console.log(`[MINIGAME] Game ended - Animals saved: ${gameEndCheck.finalScore}, Animals lost: ${animalsLost}`);
        
        // Create special end-game embed for round 8 completion
        const endGameEmbed = await this.createEndGameEmbed(session, gameEndCheck);
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
        logger.debug('MINIGAME', `Waiting ${delay} seconds before posting new round embed...`);
        
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
              logger.debug('MINIGAME', `Sending delayed turn notification after round embed for session ${session.sessionId}`);
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
        logger.info('MINIGAME', `Advancing round - Current round: ${session.gameData.currentRound}`);
        advanceResult = advanceAlienDefenseRound(session.gameData);
        logger.info('MINIGAME', `Round advanced - New round: ${session.gameData.currentRound} - ${advanceResult.message}`);
        
        // Save the session after round advancement
        session.markModified('gameData');
        await session.save();
        
        // Check if the round advancement ended the game
        if (advanceResult.gameEnded) {
          logger.info('MINIGAME', `Game ended from round advancement - ${advanceResult.message}`);
          
          // Calculate quick stats for immediate display
          const animalsSaved = session.gameData.villageAnimals;
          const totalAnimals = GAME_CONFIGS.theycame.startingAnimals;
          const animalsLost = totalAnimals - animalsSaved;
          const percentage = Math.round((animalsSaved / totalAnimals) * 100);
          const aliensDefeated = session.gameData.aliens.filter(a => a.defeated).length;
          
          // Send immediate game over message with key stats
          await interaction.followUp({
            content: `🏁 **Game Over!** Processing results...\n\n🐄 **Animals Saved:** ${animalsSaved}/${totalAnimals} (${percentage}%)\n👾 **Aliens Defeated:** ${aliensDefeated}\n⏱️ **Rounds Completed:** ${session.gameData.currentRound}/${session.gameData.maxRounds}`
          });
          
          session.status = 'finished';
          session.results.finalScore = animalsSaved;
          session.results.completedAt = new Date();
          
          // Save the completed game to database
          session.markModified('status');
          session.markModified('results');
          session.markModified('results.finalScore');
          session.markModified('results.completedAt');
          session.markModified('gameData');
          session.markModified('gameData.villageAnimals');
          
          try {
            await session.save();
            logger.success('MINIGAME', `Game completion saved to database - Session ${session.sessionId} marked as finished`);
          } catch (error) {
            console.error(`[MINIGAME] Failed to save game completion to database:`, error);
          }
          
          // Create and post the final end-game embed
          const endGameEmbed = await this.createEndGameEmbed(session, { 
            finalScore: animalsSaved, 
            message: advanceResult.message 
          });
          const endGameOptions = {
            embeds: [endGameEmbed.embed]
          };
          if (endGameEmbed.attachment) {
            endGameOptions.files = [endGameEmbed.attachment];
          }
          
          // Post the final embed after a short delay
          setTimeout(async () => {
            try {
              await interaction.followUp(endGameOptions);
            } catch (error) {
              console.error(`[MINIGAME] Failed to post end-game embed:`, error);
            }
          }, 2000); // 2 second delay to let the quick stats message show first
          
          logger.info('MINIGAME', `Game ended - Animals saved: ${animalsSaved}, Animals lost: ${animalsLost}`);
          return;
        }
        
        // Only proceed with round advancement logic if it was successful
        if (advanceResult.success) {
          // Check if turn order has reset to the first player (turn index 0)
          if (session.gameData.currentTurnIndex === 0) {
            shouldDelayTurnNotification = true;
            logger.debug('MINIGAME', 'Turn order reset to first player - will delay turn notification until after round embed');
          }
        }
      }
      
      // Check if game should end BEFORE sending turn notifications
      const gameEndCheck = checkAlienDefenseGameEnd(session.gameData);
      if (gameEndCheck.gameEnded) {
        // Calculate quick stats for immediate display
        const animalsSaved = gameEndCheck.finalScore;
        const totalAnimals = GAME_CONFIGS.theycame.startingAnimals;
        const animalsLost = totalAnimals - animalsSaved;
        const percentage = Math.round((animalsSaved / totalAnimals) * 100);
        const aliensDefeated = session.gameData.aliens.filter(a => a.defeated).length;
        
        // Send immediate game over message with key stats
        await interaction.followUp({
          content: `🏁 **Game Over!** Processing results...\n\n🐄 **Animals Saved:** ${animalsSaved}/${totalAnimals} (${percentage}%)\n👾 **Aliens Defeated:** ${aliensDefeated}\n⏱️ **Rounds Completed:** ${session.gameData.currentRound}/${session.gameData.maxRounds}`
        });
        
        session.status = 'finished';
        session.results.finalScore = gameEndCheck.finalScore;
        session.results.completedAt = new Date();
        
        // Save the completed game to database
        session.markModified('status');
        session.markModified('results');
        session.markModified('results.finalScore');
        session.markModified('results.completedAt');
        session.markModified('gameData');
        session.markModified('gameData.villageAnimals');
        
        try {
          await session.save();
          logger.success('MINIGAME', `Game completion saved to database - Session ${session.sessionId} marked as finished`);
          
        } catch (error) {
          console.error(`[MINIGAME] Failed to save game completion to database:`, error);
        }
        
        // Use already calculated animalsLost variable
        console.log(`[MINIGAME] Game ended - Animals saved: ${gameEndCheck.finalScore}, Animals lost: ${animalsLost}`);
        
        // Create special end-game embed for round 8 completion
        const endGameEmbed = await this.createEndGameEmbed(session, gameEndCheck);
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
        logger.debug('MINIGAME', `Waiting ${delay} seconds before posting new round embed...`);
        
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
              logger.debug('MINIGAME', `Sending delayed turn notification after round embed for session ${session.sessionId}`);
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
      
      // Get character name from session.players array for consistency
      const playerCharacter = session.players.find(p => p.discordId === currentPlayer.discordId);
      const characterName = playerCharacter ? playerCharacter.characterName : currentPlayer.username;
      logger.debug('MINIGAME', `Turn notification check - Session: ${session.sessionId}, Current Player: ${characterName} (${currentPlayer.discordId}), Interaction User: ${interaction.user.username} (${currentUserId}), Turn Index: ${session.gameData.currentTurnIndex}`);
      
      // Only send notification if it's someone else's turn
      if (currentPlayer.discordId !== currentUserId) {
        try {
          logger.info('MINIGAME', `Sending turn notification to ${characterName} (${currentPlayer.discordId}) for session ${session.sessionId}`);
          
          // Add timeout to prevent hanging on connection issues
          const notificationPromise = interaction.followUp({
            content: `🎯 <@${currentPlayer.discordId}>, it's your turn! Use </minigame theycame-roll:1413815457118556201> to attack aliens!`,
            allowedMentions: {
              users: [currentPlayer.discordId]
            }
          });
          
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Notification timeout after 8 seconds')), 8000)
          );
          
          await Promise.race([notificationPromise, timeoutPromise]);
          
          logger.success('MINIGAME', `Successfully sent turn notification to ${characterName} for session ${session.sessionId}`);
        } catch (error) {
          logger.error('MINIGAME', `Error sending turn notification to ${characterName} for session ${session.sessionId}`);
          
          // Fallback: Try to send a simpler notification without mentions
          try {
            logger.warn('MINIGAME', `Attempting fallback notification for ${characterName} in session ${session.sessionId}`);
            
            const fallbackPromise = interaction.followUp({
              content: `🎯 **${characterName}**, it's your turn! Use \`/minigame theycame-roll\` to attack aliens!`,
              allowedMentions: { users: [] } // Disable mentions to avoid potential issues
            });
            
            const fallbackTimeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Fallback notification timeout after 5 seconds')), 5000)
            );
            
            await Promise.race([fallbackPromise, fallbackTimeoutPromise]);
            
            logger.success('MINIGAME', `Fallback notification sent successfully to ${characterName} for session ${session.sessionId}`);
          } catch (fallbackError) {
            logger.error('MINIGAME', `Fallback notification also failed for ${characterName} in session ${session.sessionId}`);
            
            // Final fallback: Just log the information for debugging
            logger.error('MINIGAME', `NOTIFICATION FAILED - ${characterName} should take their turn in session ${session.sessionId}. Current turn index: ${session.gameData.currentTurnIndex}`);
          }
        }
      } else {
        logger.debug('MINIGAME', `Skipping turn notification - same player (${characterName}) is taking the turn`);
      }
    } else {
      logger.warn('MINIGAME', `No turn order available for session ${session.sessionId} - skipping turn notification`);
    }
  },
  
  async createJoinEmbed(session, character, joinMessage, questId = null) {
    const gameConfig = GAME_CONFIGS.theycame;
    const status = getAlienDefenseGameStatus(session.gameData);
    const availableSlots = gameConfig.maxPlayers - session.players.length;
    
    // Create player list with character names and RINGER status
    const playerList = session.players.length > 0 
      ? session.players.map(p => `• **${p.characterName}**${p.isRinger ? ' 🆘 (RINGER)' : ''}`).join('\n')
      : '*No defenders joined yet*';
    
    // Generate overlay image with aliens
    const overlayImage = await generateAlienOverlayImage(session.gameData, session.sessionId);
    
    const villageDisplayName = session.village ? session.village.charAt(0).toUpperCase() + session.village.slice(1) : 'Village';
    const villageEmoji = session.village ? getVillageEmojiByName(session.village) || '' : '';
    const ringerStatus = questId === 'RINGER' ? ' 🆘 (RINGER)' : '';
    const embed = new EmbedBuilder()
      .setTitle(`🎮 ${character.name} joined the ${villageDisplayName} alien defense!${ringerStatus}`)
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
      const turnOrderText = session.gameData.turnOrder.map((player, index) => {
        // Get character name from session.players array to ensure consistency
        const playerCharacter = session.players.find(p => p.discordId === player.discordId);
        const characterName = playerCharacter ? playerCharacter.characterName : player.username;
        return `${index === session.gameData.currentTurnIndex ? '➤' : '•'} **${characterName}**${index === session.gameData.currentTurnIndex ? ' *(Current Turn)*' : ''}`;
      }).join('\n');
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
    
    // Create player list with character names and RINGER status
    const playerList = session.players.length > 0 
      ? session.players.map(p => `• **${p.characterName}**${p.isRinger ? ' 🆘 (RINGER)' : ''}`).join('\n')
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
      const turnOrderText = session.gameData.turnOrder.map((player, index) => {
        // Get character name from session.players array to ensure consistency
        const playerCharacter = session.players.find(p => p.discordId === player.discordId);
        const characterName = playerCharacter ? playerCharacter.characterName : player.username;
        return `${index === session.gameData.currentTurnIndex ? '➤' : '•'} **${characterName}**${index === session.gameData.currentTurnIndex ? ' *(Current Turn)*' : ''}`;
      }).join('\n');
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
    
    // Create player list with character names and RINGER status
    const playerList = session.players.length > 0 
      ? session.players.map(p => `• **${p.characterName}**${p.isRinger ? ' 🆘 (RINGER)' : ''}`).join('\n')
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
      const turnOrderText = session.gameData.turnOrder.map((player, index) => {
        // Get character name from session.players array to ensure consistency
        const playerCharacter = session.players.find(p => p.discordId === player.discordId);
        const characterName = playerCharacter ? playerCharacter.characterName : player.username;
        return `${index === session.gameData.currentTurnIndex ? '➤' : '•'} **${characterName}**${index === session.gameData.currentTurnIndex ? ' *(Current Turn)*' : ''}`;
      }).join('\n');
      
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
    
    // Create dynamic footer with turn and round information
    let footerText = '🎮 Use /minigame commands to participate! • Good luck defending your village! 🛡️';
    
    if (session.status === 'active' && session.gameData.turnOrder && session.gameData.turnOrder.length > 0) {
      // Get current player character name
      const currentPlayer = session.gameData.turnOrder[session.gameData.currentTurnIndex];
      const playerCharacter = session.players.find(p => p.discordId === currentPlayer.discordId);
      const characterName = playerCharacter ? playerCharacter.characterName : currentPlayer.username;
      
      // Calculate turn number (currentTurnIndex + 1) and total turns
      const currentTurn = session.gameData.currentTurnIndex + 1;
      const totalTurns = session.gameData.turnOrder.length;
      
      // Get current round and max rounds
      const currentRound = session.gameData.currentRound;
      const maxRounds = session.gameData.maxRounds;
      
      // Get animal count
      const animalsSaved = session.gameData.villageAnimals;
      const maxAnimals = 25; // Starting animals count
      
      footerText = `🎯 ${characterName} turn ${currentTurn}/${totalTurns} | Round ${currentRound}/${maxRounds} | Animals: ${animalsSaved}/${maxAnimals}`;
    }
    
    embed.setFooter({ text: footerText });
    
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
  
  async createEndGameEmbed(session, gameEndCheck) {
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
    
    // Calculate detailed statistics
    const totalAliens = session.gameData.aliens.length;
    const aliensDefeated = session.gameData.aliens.filter(a => a.defeated).length;
    const aliensReachedBarn = session.gameData.aliens.filter(a => a.defeatedBy === 'barn').length;
    const aliensDefeatedByPlayers = aliensDefeated - aliensReachedBarn;
    const defenseRate = totalAliens > 0 ? Math.round((aliensDefeatedByPlayers / totalAliens) * 100) : 0;
    
    // Calculate round efficiency
    const roundsPlayed = session.gameData.currentRound;
    const aliensPerRound = roundsPlayed > 0 ? Math.round((totalAliens / roundsPlayed) * 10) / 10 : 0;
    
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
        value: `**${aliensDefeatedByPlayers}** aliens defeated by players\n**${aliensReachedBarn}** aliens reached the barn\n**${defenseRate}%** defense success rate`, 
        inline: true 
      },
      { 
        name: '__📊 Battle Statistics__', 
        value: `**${totalAliens}** total aliens spawned\n**${aliensPerRound}** aliens per round average\n**${session.players.length}** defenders participated`, 
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
    
    
    // Performance rating
    let performanceRating = '';
    let performanceColor = 0x00FF00; // Green
    
    if (percentage >= 90) {
      performanceRating = '🏆 **LEGENDARY DEFENSE** - Outstanding performance!';
      performanceColor = 0xFFD700; // Gold
    } else if (percentage >= 75) {
      performanceRating = '🥇 **EXCELLENT DEFENSE** - Great job protecting the village!';
      performanceColor = 0xFFA500; // Orange
    } else if (percentage >= 50) {
      performanceRating = '🥈 **GOOD DEFENSE** - Solid protection of the animals!';
      performanceColor = 0x00FF00; // Green
    } else if (percentage >= 25) {
      performanceRating = '🥉 **FAIR DEFENSE** - Some animals were lost, but you tried!';
      performanceColor = 0xFFFF00; // Yellow
    } else {
      performanceRating = '💀 **POOR DEFENSE** - The aliens had their way with the village...';
      performanceColor = 0xFF0000; // Red
    }
    
    // Update embed color based on performance
    embed.setColor(performanceColor);
    
    // Game end message
    embed.addFields(
      { 
        name: '__🎯 Final Result__', 
        value: gameEndCheck.message, 
        inline: false 
      },
      { 
        name: '__⭐ Performance Rating__', 
        value: performanceRating, 
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