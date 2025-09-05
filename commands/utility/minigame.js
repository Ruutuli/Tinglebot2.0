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
          option.setName('character')
            .setDescription('Character name - required for signup, join, and roll actions')
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('target')
            .setDescription('Target alien (e.g., A1, B2) - only needed for roll action')
            .setRequired(false)
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
    const characterName = interaction.options.getString('character');
    const target = interaction.options.getString('target');
    
    try {
      switch (action) {
        case 'signup':
          await this.handleSignUp(interaction, characterName);
          break;
        case 'join':
          await this.handleJoin(interaction, characterName);
          break;
        case 'roll':
          await this.handleRoll(interaction, characterName, target);
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
  async handleSignUp(interaction, characterName) {
    const sessionId = interaction.options.getString('session_id');
    const userId = interaction.user.id;
    
    // Validate character name
    if (!characterName) {
      return await interaction.reply({
        content: '❌ Please specify a character name for signup.',
        flags: 64
      });
    }
    
    // Fetch character
    const { fetchCharacterByNameAndUserId, fetchModCharacterByNameAndUserId } = require('../../database/db');
    let character = await fetchCharacterByNameAndUserId(characterName, userId);
    
    // If not found as regular character, try as mod character
    if (!character) {
      character = await fetchModCharacterByNameAndUserId(characterName, userId);
    }
    
    if (!character) {
      return await interaction.reply({
        content: `❌ Character "${characterName}" not found or does not belong to you.`,
        flags: 64
      });
    }
    
    const username = character.name;
    
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
      const alreadyJoined = session.players.find(p => p.characterId === character._id.toString());
      if (!alreadyJoined) {
        session.players.push({
          discordId: userId,
          characterName: character.name,
          characterId: character._id.toString(),
          isModCharacter: character.isModCharacter || false,
          joinedAt: new Date()
        });
      }
      
      await session.save();
      
      // Update the game message
      await this.updateGameMessage(interaction, session);
      
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
  async handleJoin(interaction, characterName) {
    const sessionId = interaction.options.getString('session_id');
    const userId = interaction.user.id;
    
    // Validate character name
    if (!characterName) {
      return await interaction.reply({
        content: '❌ Please specify a character name to join.',
        flags: 64
      });
    }
    
    // Fetch character
    const { fetchCharacterByNameAndUserId, fetchModCharacterByNameAndUserId } = require('../../database/db');
    let character = await fetchCharacterByNameAndUserId(characterName, userId);
    
    // If not found as regular character, try as mod character
    if (!character) {
      character = await fetchModCharacterByNameAndUserId(characterName, userId);
    }
    
    if (!character) {
      return await interaction.reply({
        content: `❌ Character "${characterName}" not found or does not belong to you.`,
        flags: 64
      });
    }
    
    const username = character.name;
    
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
    
    // Check if character already joined
    const alreadyJoined = session.players.find(p => p.characterId === character._id.toString());
    if (alreadyJoined) {
      return await interaction.reply({
        content: `✅ **${character.name}** is already in the game!`,
        flags: 64
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
    
    await session.save();
    
    // Update the game message
    await this.updateGameMessage(interaction, session);
    
    await interaction.reply({
      content: `🎮 **${character.name}** joined the alien defense!`,
      flags: 64
    });
  },

  // ============================================================================
  // ------------------- Roll Defense Handler -------------------
  // ============================================================================
  async handleRoll(interaction, characterName, target) {
    const sessionId = interaction.options.getString('session_id');
    const userId = interaction.user.id;
    
    // Validate character name
    if (!characterName) {
      return await interaction.reply({
        content: '❌ Please specify a character name to roll.',
        flags: 64
      });
    }
    
    // Fetch character
    const { fetchCharacterByNameAndUserId, fetchModCharacterByNameAndUserId } = require('../../database/db');
    let character = await fetchCharacterByNameAndUserId(characterName, userId);
    
    // If not found as regular character, try as mod character
    if (!character) {
      character = await fetchModCharacterByNameAndUserId(characterName, userId);
    }
    
    if (!character) {
      return await interaction.reply({
        content: `❌ Character "${characterName}" not found or does not belong to you.`,
        flags: 64
      });
    }
    
    const username = character.name;
    
    if (!target) {
      return await interaction.reply({
        content: '❌ Please specify target alien (e.g., A1).',
        flags: 64
      });
    }
    
    // Generate random roll (1-6)
    const roll = Math.floor(Math.random() * 6) + 1;
    
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
    
    // Check if character is in the game
    const player = session.players.find(p => p.characterId === character._id.toString());
    if (!player) {
      return await interaction.reply({
        content: `❌ **${character.name}** needs to join the game first! Use \`/minigame theycame action:join session_id:${sessionId} character:${character.name}\``,
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
      
      // Update the game message
      await this.updateGameMessage(interaction, session);
      
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
    
    // Create player list with character names
    const playerList = session.players.length > 0 
      ? session.players.map(p => `• **${p.characterName}**`).join('\n')
      : '*No defenders joined yet*';
    
    // Create alien status with better formatting
    const alienStatus = `**Outer Ring:** ${status.ringStatus.outerRing} aliens\n**Middle Ring:** ${status.ringStatus.middleRing} aliens\n**Inner Ring:** ${status.ringStatus.innerRing} aliens`;
    
    const embed = new EmbedBuilder()
      .setTitle(`👽 ${gameConfig.name} - ${title}`)
      .setDescription('*Defend your village from alien invaders! Work together to protect the livestock.*')
      .setColor(this.getGameStatusColor(session.status))
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setTimestamp();
    
    // Game progress and status
    embed.addFields(
      { 
        name: '📊 Game Progress', 
        value: `**Round:** ${status.gameProgress}\n**Status:** ${session.status === 'waiting' ? '⏳ Waiting for players' : session.status === 'active' ? '⚔️ In Progress' : '🏁 Finished'}`, 
        inline: true 
      },
      { 
        name: '👥 Defenders', 
        value: `**Count:** ${session.players.length}\n**Characters:**\n${playerList}`, 
        inline: true 
      },
      { 
        name: '🐄 Village Status', 
        value: `**Animals Saved:** ${status.villageAnimals}/25\n**Animals Lost:** ${status.animalsLost}\n**Defeated Aliens:** ${status.defeatedAliens}`, 
        inline: true 
      }
    );
    
    // Turn order info
    if (session.gameData.turnOrder && session.gameData.turnOrder.length > 0) {
      const turnOrderText = session.gameData.turnOrder.map((player, index) => 
        `${index + 1}. **${player.username}**${index === session.gameData.currentTurnIndex ? ' ⬅️ *Current Turn*' : ''}`
      ).join('\n');
      embed.addFields(
        { name: '🔄 Turn Order', value: turnOrderText, inline: false }
      );
    }
    
    // Alien threat
    embed.addFields(
      { name: '👾 Alien Threat', value: alienStatus, inline: false }
    );
    
    // Game info
    embed.addFields(
      { 
        name: '🎯 Game Info', 
        value: `**Session ID:** \`${session.sessionId}\`\n**Expires:** <t:${Math.floor(session.expiresAt.getTime() / 1000)}:R>`, 
        inline: false 
      }
    );
    
    if (session.status === 'finished') {
      embed.addFields(
        { name: '🏁 Game Result', value: `**Final Score:** ${session.results.finalScore} animals saved!`, inline: false }
      );
    }
    
    embed.setFooter({ text: '🎮 Use /minigame commands to participate! • Good luck defending your village!' });
    
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