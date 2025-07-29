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
const User = require('../../models/UserModel');
const { generateUniqueId } = require('../../utils/uniqueIdUtils');
const { syncInventory } = require('../../handlers/syncHandler');

// ============================================================================
// ------------------- Import RuuGame configuration -------------------
// Import shared game settings and prize configuration
// ============================================================================
const { 
  GAME_CONFIG, 
  PRIZES, 
  createRuuGameEmbed, 
  createRuuGameButtons, 
  getRuuGameStatusColor,
  getRollEmojis,
  awardRuuGamePrize
} = require('../../handlers/componentHandler');

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
        .setDescription('Create a new RuuGame session (Admin only)')
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
        .setName('roll')
        .setDescription('Roll a d20 in the current game (auto-joins if not in game)')
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
        case 'roll':
          await this.handleRoll(interaction);
          break;
        default:
          await interaction.reply({ content: '❌ Unknown subcommand.', flags: 64 });
      }
    } catch (error) {
      console.error('RuuGame command error:', error);
      
      // Only try to reply if the interaction hasn't been responded to yet
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
            content: '❌ An error occurred while processing your request.', 
            flags: 64 
          });
        } catch (editError) {
          console.error('Failed to send error edit response:', editError);
        }
      }
    }
  },

  // ============================================================================
  // ------------------- Validate user setup -------------------
  // Checks if user has proper character setup and synced data
  // ============================================================================
  async validateUserSetup(interaction) {
    const userId = interaction.user.id;
    
    // Check if user exists and has synced token tracker
    const user = await User.findOne({ discordId: userId });
    if (!user || !user.tokensSynced) {
      return { valid: false, message: '❌ You need to have a synced token tracker to play RuuGame.' };
    }
    
    // Check if user has at least one character with synced inventory
    const characters = await Character.find({ userId: userId });
    if (characters.length === 0) {
      return { valid: false, message: '❌ You need to have at least one character to play RuuGame.' };
    }
    
    const syncedCharacters = characters.filter(char => char.inventorySynced);
    if (syncedCharacters.length === 0) {
      return { valid: false, message: '❌ You need to have at least one character with a synced inventory to play RuuGame.' };
    }
    
    return { valid: true, characters: syncedCharacters };
  },

  // ============================================================================
  // ------------------- Handle create subcommand -------------------
  // Creates a new RuuGame session (Admin only)
  // ============================================================================
  async handleCreate(interaction) {
    // Check if user is admin
    if (!interaction.member.permissions.has('Administrator')) {
      return await interaction.reply({
        content: '❌ Only administrators can create RuuGame sessions.',
        flags: 64
      });
    }
    
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
        flags: 64
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
    
    const embed = await createRuuGameEmbed(newSession, 'Session Created!');
    const buttons = createRuuGameButtons(sessionId);
    
    await interaction.reply({
      embeds: [embed],
      components: [buttons]
    });
  },

  // ============================================================================
  // ------------------- Handle roll subcommand -------------------
  // Allows players to roll dice and update scores (auto-joins if not in game)
  // ============================================================================
  async handleRoll(interaction) {
    // Validate user setup
    const validation = await this.validateUserSetup(interaction);
    if (!validation.valid) {
      return await interaction.reply({ content: validation.message, flags: 64 });
    }
    
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
        flags: 64
      });
    }
    
    // Find player in the game or auto-join them
    let player = session.players.find(p => p.discordId === userId);
    if (!player) {
      // Auto-join the player
      if (session.players.length >= GAME_CONFIG.MAX_PLAYERS) {
        return await interaction.reply({
          content: '❌ This game is full!',
          flags: 64
        });
      }
      
      player = {
        discordId: userId,
        username: interaction.user.username,
        lastRoll: null,
        lastRollTime: null
      };
      session.players.push(player);
    }
    
    // Check cooldown
    const now = new Date();
    if (player.lastRollTime && (now - player.lastRollTime) < (GAME_CONFIG.ROLL_COOLDOWN_SECONDS * 1000)) {
      const remainingSeconds = Math.ceil((GAME_CONFIG.ROLL_COOLDOWN_SECONDS * 1000 - (now - player.lastRollTime)) / 1000);
      
      try {
        const reply = await interaction.reply({
          content: `⏰ Please wait ${remainingSeconds} seconds before rolling again.`,
          flags: 64
        });
      } catch (error) {
        console.error(`[RuuGame Command] Failed to send cooldown message:`, error);
      }
      return;
    }
    
    // Roll the dice
    const roll = Math.floor(Math.random() * GAME_CONFIG.DICE_SIDES) + 1;
    player.lastRoll = roll;
    player.lastRollTime = now;
    
    // Check for winner (exact 20, not cumulative)
    let gameEnded = false;
    let prizeAwarded = false;
    let prizeCharacter = null;

    if (roll === GAME_CONFIG.TARGET_SCORE) {
      session.status = 'finished';
      session.winner = userId;
      session.winningScore = roll;
      gameEnded = true;

      prizeCharacter = await awardRuuGamePrize(session, userId, interaction);
      prizeAwarded = prizeCharacter !== null;
    } else if (session.status === 'waiting') {
      session.status = 'active';
    }
    
    // Save the session with updated player data
    await session.save();
    
    // Fetch the updated session to ensure we have the latest data
    const updatedSession = await RuuGame.findById(session._id);
    
    const embed = await createRuuGameEmbed(updatedSession, gameEnded ? '🎉 WINNER!' : 'Roll Result!', interaction.user, prizeCharacter, roll);
    
    // Add roll announcement for non-winner rolls
    if (!gameEnded) {
      embed.setTitle(`🎲 RuuGame - ${interaction.user.username} rolled a ${roll}!`);
    }
    
    // Show buttons on ALL posts except when someone wins
    let buttons = null;
    if (!gameEnded) {
      buttons = createRuuGameButtons(session.sessionId);
    }

    await interaction.reply({
      embeds: [embed],
      components: buttons ? [buttons] : []
    });
    
    // Send prize notification if awarded
    if (prizeAwarded) {
      // Prize notification removed - consolidated into main winner embed
    }
  }
};