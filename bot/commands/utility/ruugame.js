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
    
    // Check if game is already finished
    if (session.status === 'finished') {
      return await interaction.reply({
        content: '❌ This game has already ended!',
        flags: 64
      });
    }
    
    // Additional check: if there's already a winner, don't allow more rolls
    if (session.winner && session.winner !== null) {
      return await interaction.reply({
        content: '❌ This game already has a winner!',
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
    
    // Check global cooldown
    const now = new Date();
    if (session.lastGlobalRollTime && (now - session.lastGlobalRollTime) < (GAME_CONFIG.GLOBAL_COOLDOWN_SECONDS * 1000)) {
      const remainingSeconds = Math.ceil((GAME_CONFIG.GLOBAL_COOLDOWN_SECONDS * 1000 - (now - session.lastGlobalRollTime)) / 1000);
      
      try {
        const reply = await interaction.reply({
          content: `⏰ Please wait ${remainingSeconds} seconds before anyone can roll again.`,
          flags: 64
        });
      } catch (error) {
        console.error(`[RuuGame Command] Failed to send cooldown message:`, error);
      }
      return;
    }
    
    // Check individual player cooldown
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
    session.lastGlobalRollTime = now; // Set global cooldown for all players
    
    // Check for pity prize (roll of 1)
    let pityPrizeCharacter = null;
    if (roll === 1) {
      console.log(`[RuuGame] Pity prize! User ${userId} rolled ${roll} - awarding Mock Fairy`);
      pityPrizeCharacter = await awardRuuGamePityPrize(session, userId, interaction);
    }
    
    // Check for winner (exact 20, not cumulative)
    let gameEnded = false;
    let prizeAwarded = false;
    let prizeCharacter = null;

    if (roll === GAME_CONFIG.TARGET_SCORE) {
      console.log(`[RuuGame] Winner detected! User ${userId} rolled ${roll}`);
      gameEnded = true;

      // STEP 1: Persist winner state to database BEFORE awarding prize
      let winnerPersisted = false;
      let persistRetryCount = 0;
      const maxPersistRetries = 3;
      
      while (!winnerPersisted && persistRetryCount < maxPersistRetries) {
        try {
          const winnerPersist = await RuuGame.findOneAndUpdate(
            {
              _id: session._id,
              __v: session.__v,
              status: { $ne: 'finished' },
              winner: null
            },
            {
              $set: {
                status: 'finished',
                winner: userId,
                winningScore: roll,
                players: session.players
              },
              $inc: { __v: 1 }
            },
            { new: true, runValidators: true }
          );

          if (winnerPersist) {
            session = winnerPersist;
            winnerPersisted = true;
            console.log(`[RuuGame] Winner state persisted - Session status: ${session.status}, winner: ${session.winner}`);
          } else {
            // Check if another process already finished the game
            const latestSession = await RuuGame.findById(session._id);
            if (latestSession && latestSession.status === 'finished') {
              session = latestSession;
              winnerPersisted = true;
              console.log(`[RuuGame] Session already finished by another process - Status: ${session.status}, winner: ${session.winner}`);
            } else {
              // Version conflict or other issue - retry
              persistRetryCount++;
              console.log(`[RuuGame] Winner persistence failed, retry ${persistRetryCount}/${maxPersistRetries}`);
              if (persistRetryCount < maxPersistRetries) {
                // Reload session to get latest version
                session = await RuuGame.findById(session._id);
                await new Promise(resolve => setTimeout(resolve, 100 * persistRetryCount));
              }
            }
          }
        } catch (persistError) {
          console.error(`[RuuGame] Failed to persist winner (attempt ${persistRetryCount + 1}):`, persistError);
          persistRetryCount++;
          if (persistRetryCount < maxPersistRetries) {
            // Reload session to get latest version
            session = await RuuGame.findById(session._id);
            await new Promise(resolve => setTimeout(resolve, 100 * persistRetryCount));
          }
        }
      }
      
      // If we couldn't persist the winner after all retries, abort the game
      if (!winnerPersisted) {
        console.error('[RuuGame] Failed to persist winner after all retries - aborting game');
        await interaction.reply({
          content: '❌ Error: Could not properly end the game. Please contact an administrator.',
          components: []
        });
        return;
      }
      
      // Double-check the session state before proceeding
      console.log(`[RuuGame] Session state before prize awarding - Status: ${session.status}, winner: ${session.winner}`);

      // STEP 2: Award prize AFTER winner state is persisted
      try {
        console.log(`[RuuGame] Awarding prize to user ${userId}`);
        console.log(`[RuuGame] Before awardRuuGamePrize - Session status: ${session.status}, winner: ${session.winner}`);
        prizeCharacter = await awardRuuGamePrize(session, userId, interaction);
        prizeAwarded = prizeCharacter !== null;
        console.log(`[RuuGame] After awardRuuGamePrize - Session status: ${session.status}, winner: ${session.winner}`);
        console.log(`[RuuGame] Prize awarded: ${prizeAwarded}, Character: ${prizeCharacter?.name || 'None'}`);

        // Persist prize metadata if any
        try {
          const prizeUpdate = await RuuGame.findOneAndUpdate(
            { _id: session._id },
            {
              $set: {
                prizeClaimed: session.prizeClaimed,
                prizeClaimedBy: session.prizeClaimedBy,
                prizeClaimedAt: session.prizeClaimedAt
              }
            },
            { new: true, runValidators: true }
          );
          if (prizeUpdate) {
            session = prizeUpdate;
            console.log(`[RuuGame] Prize metadata persisted - Session status: ${session.status}, winner: ${session.winner}`);
          }
        } catch (prizePersistError) {
          console.error('[RuuGame] Failed to persist prize claim data:', prizePersistError);
        }
      } catch (error) {
        console.error('Error awarding prize:', error);
        // Don't fail the game if prize awarding fails
        session.prizeClaimed = false;
        session.prizeClaimedBy = null;
        session.prizeClaimedAt = null;
      }
    } else if (session.status === 'waiting') {
      session.status = 'active';
    }
    
    // Only save/update session if game hasn't ended (winner case already handled)
    if (!gameEnded) {
      // Save the session with updated player data
      console.log(`[RuuGame] Before save - Session ${session.sessionId} status: ${session.status}, winner: ${session.winner}`);
      try {
        await session.save();
        console.log(`[RuuGame] Session ${session.sessionId} saved successfully. Status: ${session.status}`);
      } catch (saveError) {
        console.error('Error saving session:', saveError);
        // Try to save with findOneAndUpdate as fallback
        try {
          const updateResult = await RuuGame.findOneAndUpdate(
            { _id: session._id, status: { $ne: 'finished' } },
            {
              $set: {
                players: session.players,
                status: session.status,
                winner: session.winner,
                winningScore: session.winningScore,
                prizeClaimed: session.prizeClaimed,
                prizeClaimedBy: session.prizeClaimedBy,
                prizeClaimedAt: session.prizeClaimedAt,
                lastGlobalRollTime: session.lastGlobalRollTime
              }
            },
            { new: true, runValidators: true }
          );
          if (updateResult) {
            session = updateResult;
            console.log(`[RuuGame] Session ${updatedSession.sessionId} updated via findOneAndUpdate. Status: ${session.status}`);
          }
        } catch (updateError) {
          console.error('Error updating session via findOneAndUpdate:', updateError);
        }
      }
    } else {
      console.log(`[RuuGame] Skipping session save - game already finished`);
    }
    
    // Fetch the updated session to ensure we have the latest data
    const updatedSession = await RuuGame.findById(session._id);
    console.log(`[RuuGame] After save - Session ${updatedSession.sessionId} status: ${updatedSession.status}, winner: ${updatedSession.winner}`);
    
    console.log(`[RuuGame] Creating final embed - Session status: ${updatedSession.status}, winner: ${updatedSession.winner}, gameEnded: ${gameEnded}`);
    const embed = await createRuuGameEmbed(updatedSession, gameEnded ? '🎉 WINNER!' : 'Roll Result!', interaction.user, prizeCharacter, roll, pityPrizeCharacter);
    
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
}

// ------------------- Function: awardRuuGamePityPrize -------------------
// Awards Mock Fairy pity prize to players who roll a 1
async function awardRuuGamePityPrize(session, userId, interaction) {
  try {
    const characters = await Character.find({ userId: userId, inventorySynced: true });
    if (characters.length > 0) {
      const randomCharacter = characters[Math.floor(Math.random() * characters.length)];

      // Fetch the Mock Fairy item emoji from ItemModel
      const itemDetails = await ItemModel.findOne({ itemName: 'Mock Fairy' }).select('emoji');
      const itemEmoji = itemDetails?.emoji || '🧚‍♀️'; // Fallback emoji if not found

      // Add Mock Fairy to random character's inventory using inventory utilities
      const { addItemInventoryDatabase } = require('../../utils/inventoryUtils');
      await addItemInventoryDatabase(
        randomCharacter._id,
        'Mock Fairy',
        1,
        interaction,
        'RuuGame Pity Prize'
      );

      console.log(`[RuuGame] Mock Fairy awarded to ${randomCharacter.name} for rolling 1`);
      return randomCharacter; // Return the character for embed display
    }
  } catch (error) {
    console.error('Error awarding pity prize:', error);
    // Don't fail the game if pity prize awarding fails
  }
  return null;
};