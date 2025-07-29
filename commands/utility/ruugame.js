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
const RuuGame = require('../../models/RuuGameModel');
const Character = require('../../models/CharacterModel');
const { generateUniqueId } = require('../../utils/uniqueIdUtils');

// ============================================================================
// ------------------- Game configuration -------------------
// Settings for the RuuGame dice rolling game
// ============================================================================
const GAME_CONFIG = {
  TARGET_SCORE: 20,
  DICE_SIDES: 20,
  SESSION_DURATION_HOURS: 24,
  MAX_PLAYERS: 10,
  ROLL_COOLDOWN_SECONDS: 30
};

// ============================================================================
// ------------------- Prize configuration -------------------
// Available prizes and their descriptions
// ============================================================================
const PRIZES = {
  fairy: {
    name: 'Fairy',
    description: 'A magical fairy companion',
    emoji: '🧚'
  },
  job_voucher: {
    name: 'Job Voucher',
    description: 'A voucher for a new job opportunity',
    emoji: '📜'
  },
  enduring_elixir: {
    name: 'Enduring Elixir',
    description: 'A powerful elixir that grants endurance',
    emoji: '🧪'
  }
};

// ============================================================================
// ------------------- Export the slash command -------------------
// Main command structure for RuuGame
// ============================================================================
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ruugame')
    .setDescription('🎲 Play the RuuGame dice rolling challenge!')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new RuuGame session')
        .addStringOption(option =>
          option.setName('prize')
            .setDescription('Type of prize for the winner')
            .setRequired(true)
            .addChoices(
              { name: '🧚 Fairy', value: 'fairy' },
              { name: '📜 Job Voucher', value: 'job_voucher' },
              { name: '🧪 Enduring Elixir', value: 'enduring_elixir' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('join')
        .setDescription('Join an active RuuGame session')
        .addStringOption(option =>
          option.setName('session_id')
            .setDescription('The session ID to join')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('roll')
        .setDescription('Roll a d20 in the current game')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check the status of the current game')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('claim')
        .setDescription('Claim your prize if you won')
        .addStringOption(option =>
          option.setName('session_id')
            .setDescription('The session ID to claim prize from')
            .setRequired(true)
        )
    ),

  // ============================================================================
  // ------------------- Execute function -------------------
  // Main command handler for all RuuGame subcommands
  // ============================================================================
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    try {
      switch (subcommand) {
        case 'create':
          await this.handleCreate(interaction);
          break;
        case 'join':
          await this.handleJoin(interaction);
          break;
        case 'roll':
          await this.handleRoll(interaction);
          break;
        case 'status':
          await this.handleStatus(interaction);
          break;
        case 'claim':
          await this.handleClaim(interaction);
          break;
        default:
          await interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
      }
    } catch (error) {
      console.error('RuuGame command error:', error);
      await interaction.reply({ 
        content: '❌ An error occurred while processing your request.', 
        ephemeral: true 
      });
    }
  },

  // ============================================================================
  // ------------------- Handle create subcommand -------------------
  // Creates a new RuuGame session
  // ============================================================================
  async handleCreate(interaction) {
    const prizeType = interaction.options.getString('prize');
    const channelId = interaction.channelId;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    
    // Check if there's already an active session in this channel
    const existingSession = await RuuGame.findOne({
      channelId: channelId,
      status: { $in: ['waiting', 'active'] },
      expiresAt: { $gt: new Date() }
    });
    
    if (existingSession) {
      return await interaction.reply({
        content: `❌ There's already an active session in this channel (ID: ${existingSession.sessionId})`,
        ephemeral: true
      });
    }
    
    // Create new session
    const sessionId = generateUniqueId('R');
    const expiresAt = new Date(Date.now() + (GAME_CONFIG.SESSION_DURATION_HOURS * 60 * 60 * 1000));
    
    const newSession = new RuuGame({
      sessionId: sessionId,
      channelId: channelId,
      guildId: guildId,
      createdBy: userId,
      expiresAt: expiresAt,
      prizeType: prizeType,
      players: [{
        discordId: userId,
        username: interaction.user.username,
        score: 0
      }]
    });
    
    await newSession.save();
    
    const embed = this.createGameEmbed(newSession, 'Session Created!');
    const buttons = this.createGameButtons(sessionId);
    
    await interaction.reply({
      embeds: [embed],
      components: [buttons]
    });
  },

  // ============================================================================
  // ------------------- Handle join subcommand -------------------
  // Allows players to join an existing session
  // ============================================================================
  async handleJoin(interaction) {
    const sessionId = interaction.options.getString('session_id');
    const userId = interaction.user.id;
    
    const session = await RuuGame.findOne({
      sessionId: sessionId,
      status: { $in: ['waiting', 'active'] },
      expiresAt: { $gt: new Date() }
    });
    
    if (!session) {
      return await interaction.reply({
        content: '❌ Session not found or has expired.',
        ephemeral: true
      });
    }
    
    // Check if player is already in the game
    const existingPlayer = session.players.find(p => p.discordId === userId);
    if (existingPlayer) {
      return await interaction.reply({
        content: '❌ You are already in this game!',
        ephemeral: true
      });
    }
    
    // Check if game is full
    if (session.players.length >= GAME_CONFIG.MAX_PLAYERS) {
      return await interaction.reply({
        content: '❌ This game is full!',
        ephemeral: true
      });
    }
    
    // Add player to game
    session.players.push({
      discordId: userId,
      username: interaction.user.username,
      score: 0
    });
    
    await session.save();
    
    const embed = this.createGameEmbed(session, 'Player Joined!');
    const buttons = this.createGameButtons(sessionId);
    
    await interaction.reply({
      embeds: [embed],
      components: [buttons]
    });
  },

  // ============================================================================
  // ------------------- Handle roll subcommand -------------------
  // Allows players to roll dice and update scores
  // ============================================================================
  async handleRoll(interaction) {
    const userId = interaction.user.id;
    const channelId = interaction.channelId;
    
    // Find active session in this channel
    const session = await RuuGame.findOne({
      channelId: channelId,
      status: { $in: ['waiting', 'active'] },
      expiresAt: { $gt: new Date() }
    });
    
    if (!session) {
      return await interaction.reply({
        content: '❌ No active session found in this channel.',
        ephemeral: true
      });
    }
    
    // Find player in the game
    const player = session.players.find(p => p.discordId === userId);
    if (!player) {
      return await interaction.reply({
        content: '❌ You are not in this game!',
        ephemeral: true
      });
    }
    
    // Check cooldown
    const now = new Date();
    if (player.lastRollTime && (now - player.lastRollTime) < (GAME_CONFIG.ROLL_COOLDOWN_SECONDS * 1000)) {
      const remainingSeconds = Math.ceil((GAME_CONFIG.ROLL_COOLDOWN_SECONDS * 1000 - (now - player.lastRollTime)) / 1000);
      return await interaction.reply({
        content: `⏰ Please wait ${remainingSeconds} seconds before rolling again.`,
        ephemeral: true
      });
    }
    
    // Roll the dice
    const roll = Math.floor(Math.random() * GAME_CONFIG.DICE_SIDES) + 1;
    player.lastRoll = roll;
    player.lastRollTime = now;
    player.rolls.push(roll);
    player.score += roll;
    
    // Check for winner
    let gameEnded = false;
    if (player.score >= GAME_CONFIG.TARGET_SCORE) {
      session.status = 'finished';
      session.winner = userId;
      session.winningScore = player.score;
      gameEnded = true;
    } else if (session.status === 'waiting') {
      session.status = 'active';
    }
    
    await session.save();
    
    const embed = this.createGameEmbed(session, gameEnded ? 'Game Over!' : 'Roll Result!');
    const buttons = this.createGameButtons(session.sessionId);
    
    await interaction.reply({
      embeds: [embed],
      components: gameEnded ? [] : [buttons]
    });
  },

  // ============================================================================
  // ------------------- Handle status subcommand -------------------
  // Shows current game status and player scores
  // ============================================================================
  async handleStatus(interaction) {
    const channelId = interaction.channelId;
    
    const session = await RuuGame.findOne({
      channelId: channelId,
      status: { $in: ['waiting', 'active', 'finished'] },
      expiresAt: { $gt: new Date() }
    });
    
    if (!session) {
      return await interaction.reply({
        content: '❌ No active session found in this channel.',
        ephemeral: true
      });
    }
    
    const embed = this.createGameEmbed(session, 'Game Status');
    const buttons = session.status === 'finished' ? [] : this.createGameButtons(session.sessionId);
    
    await interaction.reply({
      embeds: [embed],
      components: buttons.length > 0 ? [buttons] : []
    });
  },

  // ============================================================================
  // ------------------- Handle claim subcommand -------------------
  // Allows winners to claim their prizes
  // ============================================================================
  async handleClaim(interaction) {
    const sessionId = interaction.options.getString('session_id');
    const userId = interaction.user.id;
    
    const session = await RuuGame.findOne({
      sessionId: sessionId,
      status: 'finished',
      winner: userId,
      prizeClaimed: false
    });
    
    if (!session) {
      return await interaction.reply({
        content: '❌ You are not the winner of this session or the prize has already been claimed.',
        ephemeral: true
      });
    }
    
    // Find a random character to give the prize to
    const characters = await Character.find({ userId: userId });
    if (characters.length === 0) {
      return await interaction.reply({
        content: '❌ You need to have at least one character to claim a prize.',
        ephemeral: true
      });
    }
    
    const randomCharacter = characters[Math.floor(Math.random() * characters.length)];
    
    // Mark prize as claimed
    session.prizeClaimed = true;
    session.prizeClaimedBy = randomCharacter.name;
    session.prizeClaimedAt = new Date();
    await session.save();
    
    const prize = PRIZES[session.prizeType];
    const embed = new EmbedBuilder()
      .setTitle('🎉 Prize Claimed!')
      .setDescription(`Congratulations! You've won a **${prize.name}**!`)
      .addFields(
        { name: 'Prize', value: `${prize.emoji} ${prize.name}`, inline: true },
        { name: 'Character', value: randomCharacter.name, inline: true },
        { name: 'Description', value: prize.description, inline: false }
      )
      .setColor('#00ff00')
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  },

  // ============================================================================
  // ------------------- Create game embed -------------------
  // Creates an embed showing game information
  // ============================================================================
  createGameEmbed(session, title) {
    const prize = PRIZES[session.prizeType];
    const embed = new EmbedBuilder()
      .setTitle(`🎲 RuuGame - ${title}`)
      .setDescription(`First to reach **${GAME_CONFIG.TARGET_SCORE}** wins a **${prize.name}**!`)
      .addFields(
        { name: 'Session ID', value: session.sessionId, inline: true },
        { name: 'Status', value: session.status.charAt(0).toUpperCase() + session.status.slice(1), inline: true },
        { name: 'Players', value: session.players.length.toString(), inline: true },
        { name: 'Prize', value: `${prize.emoji} ${prize.name}`, inline: true },
        { name: 'Target Score', value: GAME_CONFIG.TARGET_SCORE.toString(), inline: true },
        { name: 'Dice', value: `d${GAME_CONFIG.DICE_SIDES}`, inline: true }
      )
      .setColor(this.getStatusColor(session.status))
      .setTimestamp();
    
    // Add player scores
    if (session.players.length > 0) {
      const playerList = session.players
        .sort((a, b) => b.score - a.score)
        .map((player, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';
          const lastRoll = player.lastRoll ? ` (Last: ${player.lastRoll})` : '';
          return `${medal} **${player.username}**: ${player.score}${lastRoll}`;
        })
        .join('\n');
      
      embed.addFields({ name: 'Scores', value: playerList, inline: false });
    }
    
    if (session.winner) {
      const winner = session.players.find(p => p.discordId === session.winner);
      embed.addFields({ 
        name: '🏆 Winner!', 
        value: `**${winner.username}** with ${session.winningScore} points!`, 
        inline: false 
      });
    }
    
    return embed;
  },

  // ============================================================================
  // ------------------- Create game buttons -------------------
  // Creates action buttons for the game
  // ============================================================================
  createGameButtons(sessionId) {
    return new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`ruugame_join_${sessionId}`)
          .setLabel('Join Game')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🎮'),
        new ButtonBuilder()
          .setCustomId(`ruugame_roll_${sessionId}`)
          .setLabel('Roll d20')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🎲'),
        new ButtonBuilder()
          .setCustomId(`ruugame_status_${sessionId}`)
          .setLabel('Status')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📊')
      );
  },

  // ============================================================================
  // ------------------- Get status color -------------------
  // Returns appropriate color for game status
  // ============================================================================
  getStatusColor(status) {
    switch (status) {
      case 'waiting': return '#ffff00'; // Yellow
      case 'active': return '#00ff00'; // Green
      case 'finished': return '#ff0000'; // Red
      default: return '#0099ff'; // Blue
    }
  }
};