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
const { handleError } = require('../../utils/globalErrorHandler');

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
    return `❌ Game session **${sessionId}** has already finished. Please start a new game.`;
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
      handleError(error, 'minigame.js', {
        commandName: 'minigame',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        subcommand: subcommand
      });
      
      console.error('[minigame.js]: Command execution error', error);
      
      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({ 
            content: '❌ An error occurred while processing your request.', 
            ephemeral: true 
          });
        } catch (replyError) {
          console.error('Failed to send error response:', replyError);
        }
      } else if (interaction.deferred) {
        try {
          await interaction.editReply({ 
            content: '❌ An error occurred while processing your request.' 
          });
        } catch (editError) {
          console.error('Failed to send error edit response:', editError);
        }
      }
    }
  },




  // ============================================================================
  // ------------------- Join Game Handler -------------------
  // ============================================================================
  async handleJoin(interaction) {
    const sessionId = interaction.options.getString('session_id');
    const resolvedCharacterName = interaction.options.getString('character');
    const questId = interaction.options.getString('questid');
    const userId = interaction.user.id;
    
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
      if (participant.resolvedCharacterName !== resolvedCharacterName) {
        return await interaction.editReply({
          content: `❌ You are participating in this quest with character "${participant.resolvedCharacterName}", not "${resolvedCharacterName}".`
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
  },

  // ============================================================================
  // ------------------- Roll Defense Handler -------------------
  // ============================================================================
  async handleRoll(interaction) {
    const sessionId = interaction.options.getString('session_id');
    const target = interaction.options.getString('target');
    const userId = interaction.user.id;
    
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
    
    // Check if we should automatically advance the round
    let advanceResult = null;
    if (result.shouldAdvanceRound) {
      console.log(`[MINIGAME] Advancing round - Current round: ${session.gameData.currentRound}`);
      advanceResult = advanceAlienDefenseRound(session.gameData);
      console.log(`[MINIGAME] Round advanced - New round: ${session.gameData.currentRound} - ${advanceResult.message}`);
    }
    
    if (result.success) {
      // Check if game should end
      const gameEndCheck = checkAlienDefenseGameEnd(session.gameData);
      if (gameEndCheck.gameEnded) {
        session.status = 'finished';
        session.results.finalScore = gameEndCheck.finalScore;
        session.results.completedAt = new Date();
      }
      
      session.markModified('gameData');
      await session.save();
      
      // Create embed for successful roll (before updating main game message)
      const embedResult = await this.createMinigameEmbed(session, 'Defense Roll', character);
      
      // Set color to cyan blue for successful hits
      embedResult.embed.setColor(0x00FFFF); // Cyan blue
      
      // Add roll result to embed description (no advancement messages here)
      let description = embedResult.embed.data.description;
      description += `\n\n**${result.message}**`;
      embedResult.embed.setDescription(description);
      
      const replyOptions = {
        embeds: [embedResult.embed]
      };
      if (embedResult.attachment) {
        replyOptions.files = [embedResult.attachment];
      }
      await interaction.editReply(replyOptions);
      
      // If round advanced automatically, post a separate red embed FIRST
      if (advanceResult && advanceResult.success) {
        const roundAdvanceEmbed = await this.createDetailedMinigameEmbed(session, `Round ${session.gameData.currentRound} Advanced!`, character);
        roundAdvanceEmbed.embed.setColor('#FF0000'); // Red color
        
        // Add movement and spawning information to the round advance embed
        let description = roundAdvanceEmbed.embed.data.description;
        description += `\n\n**${advanceResult.message}**`;
        
        // Add movement messages if any aliens moved
        if (advanceResult.movementMessages && advanceResult.movementMessages.length > 0) {
          description += `\n\n${advanceResult.movementMessages.join('\n')}`;
        }
        
        // Add spawning information if new aliens spawned
        if (advanceResult.spawnLocations && advanceResult.spawnLocations.length > 0) {
          description += `\n\n${advanceResult.spawnLocations.join('\n')}`;
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
      
      // Check if game should end
      const gameEndCheck = checkAlienDefenseGameEnd(session.gameData);
      if (gameEndCheck.gameEnded) {
        session.status = 'finished';
        session.results.finalScore = gameEndCheck.finalScore;
        session.results.completedAt = new Date();
      }
      
      session.markModified('gameData');
      await session.save();
      
      // Create embed for failed roll
      const embedResult = await this.createMinigameEmbed(session, 'Defense Roll', character);
      
      // Set color to highlighter orange for misses
      embedResult.embed.setColor(0xFFA500); // Highlighter orange
      
      // Add roll result to embed description (no advancement messages here)
      let description = embedResult.embed.data.description;
      description += `\n\n**${result.message}**`;
      embedResult.embed.setDescription(description);
      
      const replyOptions = {
        embeds: [embedResult.embed]
      };
      if (embedResult.attachment) {
        replyOptions.files = [embedResult.attachment];
      }
      await interaction.editReply(replyOptions);
      
      // If round advanced automatically, post a separate red embed FIRST
      if (advanceResult && advanceResult.success) {
        const roundAdvanceEmbed = await this.createDetailedMinigameEmbed(session, `Round ${session.gameData.currentRound} Advanced!`, character);
        roundAdvanceEmbed.embed.setColor('#FF0000'); // Red color
        
        // Add movement and spawning information to the round advance embed
        let description = roundAdvanceEmbed.embed.data.description;
        description += `\n\n**${advanceResult.message}**`;
        
        // Add movement messages if any aliens moved
        if (advanceResult.movementMessages && advanceResult.movementMessages.length > 0) {
          description += `\n\n${advanceResult.movementMessages.join('\n')}`;
        }
        
        // Add spawning information if new aliens spawned
        if (advanceResult.spawnLocations && advanceResult.spawnLocations.length > 0) {
          description += `\n\n${advanceResult.spawnLocations.join('\n')}`;
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
      }
      
      // Update the main game message AFTER the round advancement embed is posted
      await this.updateGameMessage(interaction, session);
    }
  },


  // ============================================================================
  // ------------------- Helper Functions -------------------
  // ============================================================================
  
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
    
    const embed = new EmbedBuilder()
      .setTitle(`🎮 ${character.name} joined the alien defense!`)
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
          name: '👥 Defenders & Turn Order', 
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
    
    const embed = new EmbedBuilder()
      .setTitle(`👽 ${gameConfig.name} - ${title}`)
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
        name: '📊 Game Progress', 
        value: `${status.gameProgress}\n${gameStatusText}`, 
        inline: false 
      },
      { 
        name: '🐄 Village Status', 
        value: `**${status.villageAnimals}/25** animals saved\n${status.animalsLost} lost • ${status.defeatedAliens} aliens defeated`, 
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
        turnOrderValue += `\n\n**🎯 Next Turn!** Use </minigame theycame-roll:1413815457118556201> to go!`;
      }
      
      embed.addFields(
        { 
          name: '👥 Defenders & Turn Order', 
          value: `**${session.players.length} player${session.players.length !== 1 ? 's' : ''}**\n${turnOrderValue}`, 
          inline: false 
        }
      );
    }
    
    // Alien threat with positions
    const alienPositions = getAlienPositions(session.gameData);
    let alienThreatText = `**Outer Ring:** ${status.ringStatus.outerRing} aliens\n**Middle Ring:** ${status.ringStatus.middleRing} aliens\n**Inner Ring:** ${status.ringStatus.innerRing} aliens`;
    
    if (alienPositions.length > 0) {
      const positionText = alienPositions.map(alien => {
        const ringNames = ['Outer', 'Middle', 'Inner'];
        const ringName = ringNames[alien.ring - 1] || 'Unknown';
        return `**${alien.id}** (${ringName} Ring)`;
      }).join('\n');
      alienThreatText += `\n\n**Active Aliens:**\n${positionText}`;
    }
    
    embed.addFields(
      { 
        name: '👾 Alien Threat', 
        value: alienThreatText, 
        inline: false 
      }
    );
    
    // Game info
    embed.addFields(
      { 
        name: '🎯 Session Info', 
        value: `**ID:** \`${session.sessionId}\`\n**Status:** ${gameStatusText}`, 
        inline: false 
      }
    );
    
    if (session.status === 'finished') {
      embed.addFields(
        { name: '🏁 Game Result', value: `**Final Score:** ${session.results.finalScore} animals saved!`, inline: false }
      );
    }
    
    embed.setFooter({ text: '🎮 Use /minigame commands to participate! • Good luck defending your village!' });
    
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
    
    const embed = new EmbedBuilder()
      .setTitle(`👽 ${gameConfig.name} - ${title}`)
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
        value: `__${status.gameProgress} • ${gameStatusText}__`, 
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
          name: '👥 Defenders & Turn Order', 
          value: `**${session.players.length} player${session.players.length !== 1 ? 's' : ''}**\n${turnOrderText}`, 
          inline: false 
        }
      );
    }
    
    // Add ring difficulty info and command instruction for active games
    if (session.status === 'active') {
      embed.addFields(
        { 
          name: '🎯 Take Your Turn', 
          value: `**Use </minigame theycame-roll:1413815457118556201> to attack aliens!**\n\n**Ring Difficulties:**\n• **Outer (1A, 1B)** - **5-6** to hit\n• **Middle (2A, 2B)** - **4-6** to hit\n• **Inner (3A, 3B)** - **3-6** to hit`, 
          inline: false 
        }
      );
    }
    
    if (session.status === 'finished') {
      embed.addFields(
        { name: '🏁 Game Result', value: `**Final Score:** ${session.results.finalScore} animals saved!`, inline: false }
      );
    }
    
    embed.setFooter({ text: '🎮 Use /minigame commands to participate! • Good luck defending your village!' });
    
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
  }
};