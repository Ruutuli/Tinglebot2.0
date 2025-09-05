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
  getAlienDefenseGameStatus
} = require('../../modules/minigameModule');

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
        .setName('theycame')
        .setDescription('👽 They Came for the Cows - Alien Defense Minigame')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('What action to take')
            .setRequired(true)
            .addChoices(
              { name: 'Sign Up', value: 'signup' },
              { name: 'Join Game', value: 'join' },
              { name: 'Roll Defense', value: 'roll' },
              { name: 'View Status', value: 'status' }
            )
        )
        .addStringOption(option =>
          option.setName('session_id')
            .setDescription('Game session ID')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('target')
            .setDescription('Target alien (e.g., A1, B2) - only needed for roll action')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option.setName('roll')
            .setDescription('Your defense roll (1-6) - only needed for roll action')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(6)
        )
    ),

  // ============================================================================
  // ------------------- Execute function -------------------
  // Main command handler for all minigame subcommands
  // ============================================================================
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    try {
      if (subcommand === 'theycame') {
        await this.handleTheyCame(interaction);
      } else {
        await interaction.reply({ content: '❌ Unknown minigame type.', flags: 64 });
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
            flags: 64 
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
  // ------------------- They Came for the Cows Handler -------------------
  // ============================================================================
  async handleTheyCame(interaction) {
    const action = interaction.options.getString('action');
    const sessionId = interaction.options.getString('session_id');
    const target = interaction.options.getString('target');
    const roll = interaction.options.getInteger('roll');
    
    try {
      switch (action) {
        case 'signup':
          await this.handleSignUp(interaction);
          break;
        case 'join':
          await this.handleJoin(interaction);
          break;
        case 'roll':
          await this.handleRoll(interaction, target, roll);
          break;
        case 'status':
          await this.handleStatus(interaction);
          break;
        default:
          await interaction.reply({ content: '❌ Unknown action.', flags: 64 });
      }
    } catch (error) {
      handleError(error, 'minigame.js', {
        commandName: 'theycame',
        action: action,
        userTag: interaction.user.tag,
        userId: interaction.user.id
      });
      throw error;
    }
  },

  // ============================================================================
  // ------------------- Sign Up Handler -------------------
  // ============================================================================
  async handleSignUp(interaction) {
    const sessionId = interaction.options.getString('session_id');
    const userId = interaction.user.id;
    const username = interaction.user.username;
    
    // Find the specific session
    const session = await Minigame.findOne({
      sessionId: sessionId,
      gameType: 'theycame',
      status: { $in: ['waiting', 'active'] },
      expiresAt: { $gt: new Date() }
    });
    
    if (!session) {
      return await interaction.reply({
        content: '❌ Game session not found, expired, or already finished.',
        flags: 64
      });
    }
    
    // Add player to turn order
    const result = addPlayerToTurnOrder(session.gameData, userId, username);
    
    if (result.success) {
      // Also add to players list if not already there
      const alreadyJoined = session.players.find(p => p.discordId === userId);
      if (!alreadyJoined) {
        session.players.push({
          discordId: userId,
          username: username,
          joinedAt: new Date()
        });
      }
      
      await session.save();
      
      await interaction.reply({
        content: result.message,
        flags: 64
      });
    } else {
      await interaction.reply({
        content: result.message,
        flags: 64
      });
    }
  },

  // ============================================================================
  // ------------------- Join Game Handler -------------------
  // ============================================================================
  async handleJoin(interaction) {
    const sessionId = interaction.options.getString('session_id');
    const userId = interaction.user.id;
    const username = interaction.user.username;
    
    // Find the specific session
    const session = await Minigame.findOne({
      sessionId: sessionId,
      gameType: 'theycame',
      status: { $in: ['waiting', 'active'] },
      expiresAt: { $gt: new Date() }
    });
    
    if (!session) {
      return await interaction.reply({
        content: '❌ Game session not found, expired, or already finished.',
        flags: 64
      });
    }
    
    // Check if player already joined
    const alreadyJoined = session.players.find(p => p.discordId === userId);
    if (alreadyJoined) {
      return await interaction.reply({
        content: '✅ You\'re already in the game!',
        flags: 64
      });
    }
    
    // Add player to game
    session.players.push({
      discordId: userId,
      username: username,
      joinedAt: new Date()
    });
    
    await session.save();
    
    await interaction.reply({
      content: `🎮 **${username}** joined the alien defense!`,
      flags: 64
    });
  },

  // ============================================================================
  // ------------------- Roll Defense Handler -------------------
  // ============================================================================
  async handleRoll(interaction, target, roll) {
    const sessionId = interaction.options.getString('session_id');
    const userId = interaction.user.id;
    const username = interaction.user.username;
    
    if (!target || !roll) {
      return await interaction.reply({
        content: '❌ Please specify both target alien (e.g., A1) and your roll (1-6).',
        flags: 64
      });
    }
    
    // Find the specific session
    const session = await Minigame.findOne({
      sessionId: sessionId,
      gameType: 'theycame',
      status: { $in: ['waiting', 'active'] },
      expiresAt: { $gt: new Date() }
    });
    
    if (!session) {
      return await interaction.reply({
        content: '❌ Game session not found, expired, or already finished.',
        flags: 64
      });
    }
    
    // Check if player is in the game
    const player = session.players.find(p => p.discordId === userId);
    if (!player) {
      return await interaction.reply({
        content: '❌ You need to join the game first! Use `/minigame join session_id:' + sessionId + '`',
        flags: 64
      });
    }
    
    // Process the roll
    const result = processAlienDefenseRoll(session.gameData, userId, username, target, roll);
    
    if (result.success) {
      // Check if game should end
      const gameEndCheck = checkAlienDefenseGameEnd(session.gameData);
      if (gameEndCheck.gameEnded) {
        session.status = 'finished';
        session.results.finalScore = gameEndCheck.finalScore;
        session.results.completedAt = new Date();
      }
      
      await session.save();
      
      const embed = await this.createMinigameEmbed(session, 'Defense Roll!');
      await interaction.reply({
        content: result.message,
        embeds: [embed]
      });
    } else {
      await interaction.reply({
        content: result.message,
        flags: 64
      });
    }
  },

  // ============================================================================
  // ------------------- Status Handler -------------------
  // ============================================================================
  async handleStatus(interaction) {
    const sessionId = interaction.options.getString('session_id');
    
    // Find the specific session
    const session = await Minigame.findOne({
      sessionId: sessionId,
      gameType: 'theycame'
    });
    
    if (!session) {
      return await interaction.reply({
        content: '❌ Game session not found.',
        flags: 64
      });
    }
    
    const embed = await this.createMinigameEmbed(session, 'Game Status');
    await interaction.reply({ embeds: [embed] });
  },

  // ============================================================================
  // ------------------- Embed Creation -------------------
  // ============================================================================
  
  async createMinigameEmbed(session, title) {
    const gameConfig = GAME_CONFIGS.theycame;
    const status = getAlienDefenseGameStatus(session.gameData);
    
    const embed = new EmbedBuilder()
      .setTitle(`👽 ${gameConfig.name} - ${title}`)
      .setDescription(gameConfig.description)
      .setColor(this.getGameStatusColor(session.status))
      .setTimestamp();
    
    // Game progress
    embed.addFields(
      { name: '📊 Game Progress', value: status.gameProgress, inline: true },
      { name: '👥 Players', value: session.players.length.toString(), inline: true },
      { name: '🐄 Animals Saved', value: status.villageAnimals.toString(), inline: true }
    );
    
    // Turn order info
    if (session.gameData.turnOrder && session.gameData.turnOrder.length > 0) {
      const turnOrderText = session.gameData.turnOrder.map((player, index) => 
        `${index + 1}. ${player.username}${index === session.gameData.currentTurnIndex ? ' ⬅️' : ''}`
      ).join('\n');
      embed.addFields(
        { name: '🔄 Turn Order', value: turnOrderText || 'No players signed up', inline: false }
      );
    }
    
    // Alien status
    embed.addFields(
      { name: '👾 Active Aliens', value: `Outer: ${status.ringStatus.outerRing} | Middle: ${status.ringStatus.middleRing} | Inner: ${status.ringStatus.innerRing}`, inline: false },
      { name: '💀 Defeated Aliens', value: status.defeatedAliens.toString(), inline: true },
      { name: '🚨 Animals Lost', value: status.animalsLost.toString(), inline: true }
    );
    
    // Game info
    embed.addFields(
      { name: '🎯 Session ID', value: session.sessionId, inline: true },
      { name: '⏰ Expires', value: `<t:${Math.floor(session.expiresAt.getTime() / 1000)}:R>`, inline: true }
    );
    
    if (session.status === 'finished') {
      embed.addFields(
        { name: '🏁 Game Result', value: `Final Score: ${session.results.finalScore} animals saved!`, inline: false }
      );
    }
    
    return embed;
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