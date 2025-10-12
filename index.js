// Auto-deployed via GitHub Actions
// ------------------- Load Environment -------------------
const dotenv = require('dotenv');

// Load environment variables 
dotenv.config();

const port = process.env.PORT || 5001;

// ------------------- Standard Libraries -------------------
const figlet = require("figlet");

// ------------------- Discord.js Components -------------------
const { Client, GatewayIntentBits, Partials } = require("discord.js");

// ------------------- Database Connections -------------------
const { connectToTinglebot, connectToInventories } = require("./database/db");
const TempData = require("./models/TempDataModel");

// ------------------- Handlers -------------------

const { handleAutocomplete } = require("./handlers/autocompleteHandler");
const { handleComponentInteraction } = require("./handlers/componentHandler");
const { handleSelectMenuInteraction } = require("./handlers/selectMenuHandler");
const { handleInteraction, initializeReactionHandler } = require('./handlers/interactionHandler');
const { initializeReactionRolesHandler } = require('./handlers/reactionRolesHandler');
// const { handleMessage } = require('./handlers/messageHandler');
const { startExpirationChecks } = require('./utils/expirationHandler');
const logger = require('./utils/logger');

// ------------------- Scripts -------------------
const {
  handleError,
  initializeErrorHandler,
  initializeErrorTracking,
} = require("./utils/globalErrorHandler");
const {
  createTrelloCard,
  logWishlistToTrello,
  logErrorToTrello,
} = require("./scripts/trello");
const { isBloodMoonDay } = require("./scripts/bloodmoon");
// const { initializeRandomEncounterBot } = require("./scripts/randomEncounters");
const {
  initializeScheduler,
  setupWeatherScheduler,
  setupBlightScheduler
} = require('./scheduler');
const { convertToHyruleanDate } = require("./modules/calendarModule");

// ------------------- Weather -------------------


// ============================================================================
// ------------------- Main Initialization -------------------
// ============================================================================
let client;

// Suppress circular dependency warnings
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' || warning.name === 'ExperimentalWarning') {
    return;
  }
  logger.warn('SYSTEM', `${warning.name}: ${warning.message}`);
});

// ----------------------------------------------------------------------------
// ──────────────────── Database Initialization ──────────────────────────────
// ----------------------------------------------------------------------------
async function initializeDatabases() {
  try {
    logger.info('DATABASE', 'Connecting to databases...');
    
    // Add timeout to database connections (increased to 60 seconds)
    const connectionTimeout = setTimeout(() => {
      logger.error('DATABASE', 'Connection timeout after 60 seconds');
      process.exit(1);
    }, 60000);

    await connectToTinglebot();
    await connectToInventories();
    
    clearTimeout(connectionTimeout);
    
    // Clean up expired temp data and entries without expiration dates
    const [expiredResult, noExpirationResult] = await Promise.all([
      TempData.cleanup(),
      TempData.deleteMany({ expiresAt: { $exists: false } })
    ]);
    logger.success('CLEANUP', `${expiredResult.deletedCount} expired temp data`);
    logger.success('CLEANUP', `${noExpirationResult.deletedCount} entries without expiration`);
    
    // Clean up expired and fulfilled boosting data
    const boostingCleanupResult = await TempData.deleteMany({
      type: 'boosting',
      $or: [
        { expiresAt: { $lt: new Date() } },
        { 'data.status': 'expired' },
        { 'data.status': 'fulfilled', 'data.boostExpiresAt': { $lt: Date.now() } }
      ]
    });
    logger.success('CLEANUP', `${boostingCleanupResult.deletedCount} expired boosting entries`);
    
    logger.success('DATABASE', 'Connected successfully');
  } catch (err) {
    logger.error('DATABASE', `Initialization error: ${err.message}`);
    logger.error('DATABASE', `Details: ${err.name}`);
    process.exit(1);
  }
}



// Add process error handlers
process.on('uncaughtException', (error) => {
  logger.error('SYSTEM', `Uncaught Exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('SYSTEM', `Unhandled Rejection: ${reason}`);
  process.exit(1);
});

// Add graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info('SYSTEM', 'Received SIGTERM. Performing graceful shutdown...');
  try {
    if (client) {
      logger.info('SYSTEM', 'Destroying Discord client...');
      await client.destroy();
    }
    
    // Close database connections gracefully
    logger.info('SYSTEM', 'Closing database connections...');
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    
    logger.success('SYSTEM', 'Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('SYSTEM', `Error during graceful shutdown: ${error.message}`);
    process.exit(1);
  }
});

// Also handle SIGINT (Ctrl+C) gracefully
process.on('SIGINT', async () => {
  logger.info('SYSTEM', 'Received SIGINT. Performing graceful shutdown...');
  try {
    if (client) {
      console.log('[index.js]: Destroying Discord client...');
      await client.destroy();
    }
    
    // Close database connections gracefully
    console.log('[index.js]: Closing database connections...');
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    
    console.log('[index.js]: Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[index.js]: Error during graceful shutdown:', error.message);
    process.exit(1);
  }
});

// ----------------------------------------------------------------------------
// ──────────────────── Client Setup and Event Binding ───────────────────────
// ----------------------------------------------------------------------------
async function initializeClient() {
  try {
    // Initialize databases first
    await initializeDatabases();

    client = new Client({
      intents: [
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.Guilds,
      ],
      partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
      ],
    });

    // Add error handler for Discord client
    client.on('error', error => {
      console.error('[index.js]: Discord client error:', error);
      process.exit(1);
    });

    // Add error handler for Discord connection
    client.on('disconnect', () => {
      console.log('[index.js]: Discord client disconnected');
      process.exit(1);
    });

    module.exports = { client };

    // Import command handlers
    const commandHandler = require("./handlers/commandHandler");
    commandHandler(client);

    client.once("ready", async () => {
      initializeErrorHandler(logErrorToTrello, client);
      initializeErrorTracking(client);
    });

    client.once("ready", async () => {
      console.clear();

      figlet.text(
        "Tinglebot 2.0",
        {
          font: "Slant",
          horizontalLayout: "default",
          verticalLayout: "default",
        },
        async (err, data) => {
          if (err) return;

          console.log(data);
          console.log("==========================================================");
          console.log("[index.js]: 🤖 Bot is online");

          try {
            // Initialize core systems
            initializeReactionHandler(client);
            initializeReactionRolesHandler(client);
            logBloodMoonStatus();
            initializeScheduler(client);
            startExpirationChecks(client);
            
            // Initialize random encounters system
            const { initializeRandomEncounterBot } = require('./scripts/randomMonsterEncounters');
            initializeRandomEncounterBot(client);
          } catch (error) {
            handleError(error, "index.js", {
              operation: 'initialization',
              context: 'scheduler_and_encounters'
            });
          }
        }
      );
    });

    // --------------------------------------------------------------------------
    // Interaction Handling
    // --------------------------------------------------------------------------
    client.on("interactionCreate", async (interaction) => {
      try {
        if (interaction.isCommand()) {
          const command = client.commands.get(interaction.commandName);
          if (!command) return;

          try {
            await command.execute(interaction);
          } catch (error) {
            handleError(error, 'index.js', {
              commandName: interaction.commandName,
              userTag: interaction.user?.tag,
              userId: interaction.user?.id,
              options: interaction.options?.data
            });
            console.error(`[index.js]: Command execution error:`, error);
            
            // Check if it's a webhook token error
            if (error.code === 50027) {
              console.warn('[index.js]: Webhook token expired, sending error as regular message');
              try {
                await interaction.channel.send('❌ The command took too long to complete. Please try again.');
              } catch (sendError) {
                console.error('[index.js]: Failed to send fallback error message:', sendError);
              }
              return;
            }
            
            const errorMessage = { content: 'There was an error while executing this command!', flags: [4096] };
            try {
              if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
              } else {
                await interaction.reply(errorMessage);
              }
            } catch (responseError) {
              console.error('[index.js]: Failed to send error response:', responseError);
              // Final fallback - send as regular message
              try {
                await interaction.channel.send('❌ There was an error while executing this command!');
              } catch (sendError) {
                console.error('[index.js]: Failed to send fallback error message:', sendError);
              }
            }
          }
        } else if (interaction.isButton()) {
          await handleComponentInteraction(interaction);
        } else if (interaction.isStringSelectMenu()) {
          console.log(`[index.js]: 🔄 Processing select menu interaction: ${interaction.customId}`);
          
          // Route submission-related select menus to the submission handler
          const submissionMenuIds = ['baseSelect', 'typeMultiplierSelect', 'productMultiplierSelect', 'addOnsSelect', 'specialWorksSelect'];
          if (submissionMenuIds.includes(interaction.customId)) {
            await handleSelectMenuInteraction(interaction);
          } else {
            // Route other select menus to the component handler
            await handleComponentInteraction(interaction);
          }
        } else if (interaction.isAutocomplete()) {
          const command = client.commands.get(interaction.commandName);
          if (command && typeof command.autocomplete === "function") {
            try {
              await command.autocomplete(interaction);
            } catch (error) {
              handleError(error, "index.js", {
                commandName: interaction.commandName,
                userTag: interaction.user?.tag,
                userId: interaction.user?.id,
                operation: 'autocomplete'
              });
              console.error(
                `[index.js]: ❌ Error in command autocomplete handler for '${interaction.commandName}':`,
                error
              );
              await interaction.respond([]);
            }
          } else {
            await handleAutocomplete(interaction);
          }
        } else if (interaction.isModalSubmit()) {
          const { handleModalSubmission } = require("./handlers/modalHandler");
          await handleModalSubmission(interaction);
        } else {
          console.warn(`[index.js]: Unhandled interaction type: ${interaction.type}`);
        }
      } catch (error) {
        handleError(error, "index.js", {
          commandName: interaction?.commandName || 'Unknown',
          userTag: interaction?.user?.tag || 'Unknown',
          userId: interaction?.user?.id || 'Unknown',
          interactionType: interaction?.type || 'Unknown'
        });
        console.error("[index.js]: ❌ Interaction error:", error);
      }
    });

    // --------------------------------------------------------------------------
    // Error Report Channel Handling
    // --------------------------------------------------------------------------
    client.on("messageCreate", async (message) => {
      const ERROR_REPORT_CHANNEL_ID = "1379974822506795030";
      
      // Check if the message is in the error report channel
      if (message.channelId !== ERROR_REPORT_CHANNEL_ID) {
        return;
      }

      if (message.author.bot) {
        return;
      }

      if (!message.content.replace(/\*/g, "").startsWith("Command")) {
        const reply = await message.reply(
          "❌ **Bug Report Rejected — Missing Required Format!**\n\n" +
            "Your message must start with this line:\n" +
            "`Command: [Command Name]`\n\n" +
            "> Example:\n> `Command: /gather`\n\n" +
            "Please update your post to match this format:\n\n" +
            "**Command:** [Specify the command or feature]\n" +
            "**Issue:** [Brief description of the problem]\n" +
            "**Steps to Reproduce:**\n1. [Step 1]\n2. [Step 2]\n" +
            "**Error Output:** [Error message]\n**Screenshots:** [Attach images]\n" +
            "**Expected Behavior:** [What you expected to happen]\n" +
            "**Actual Behavior:** [What actually happened]"
        );

        setTimeout(() => reply.delete().catch(() => {}), 600000);
        return;
      }

      try {
        // Extract command name from the message content
        const commandMatch = message.content.match(/Command:\s*\[?([^\n\]]+)\]?/i);
        const threadName = commandMatch ? commandMatch[1].trim() : 'Unknown Command';
        
        const username = message.author?.tag || message.author?.username || `User-${message.author?.id}`;
        const content = message.content;
        const createdAt = message.createdAt;
        const images = message.attachments.map((attachment) => attachment.url);

        const cardUrl = await createTrelloCard({
          threadName,
          username,
          content,
          images,
          createdAt,
        });

        if (cardUrl) {
          await message.reply(
            `✅ Bug report sent to Trello! ${cardUrl}\n\n_You can add comments to the Trello card if you want to provide more details or updates later._`
          );
        } else {
          await message.reply(`❌ Failed to send bug report to Trello.`);
        }
      } catch (err) {
        console.error("[index.js]: ❌ Error handling error report for Trello:", err);
        console.error("[index.js]: Error details:", {
          name: err.name,
          message: err.message,
          stack: err.stack
        });
      }
    });

    // --------------------------------------------------------------------------
    // Wishlist Channel Handling
    // --------------------------------------------------------------------------
    client.on("messageCreate", async (message) => {
      const WISHLIST_CHANNEL_ID = "1319826690935099463";
      if (message.channelId !== WISHLIST_CHANNEL_ID) return;
      if (message.author.bot) return;

      const content = message.content;
      const author = message.author.tag;

      try {
        await logWishlistToTrello(content, author, process.env.TRELLO_WISHLIST);
        await message.react("⭐");
      } catch (err) {
        console.error("[index.js]: Failed to log wishlist to Trello:", err);
        await message.reply("❌ Could not send this wishlist item to Trello.");
      }
    });

    // --------------------------------------------------------------------------
    // New Channel Handling
    // --------------------------------------------------------------------------
    client.on("messageCreate", async (message) => {
      const NEW_CHANNEL_ID = "1381442926667763773";
      if (message.channelId !== NEW_CHANNEL_ID) return;
      if (message.author.bot) return;

      const content = message.content;
      const author = message.author.tag;

      try {
        await logWishlistToTrello(content, author, process.env.TRELLO_WISHLIST);
        await message.react("⭐");
      } catch (err) {
        console.error("[index.js]: Failed to log wishlist to Trello:", err);
        await message.reply("❌ Could not send this wishlist item to Trello.");
      }
    });

    // --------------------------------------------------------------------------
    // RP Quest Post Tracking
    // --------------------------------------------------------------------------
    client.on("messageCreate", async (message) => {
      if (message.author.bot) return;
      if (!message.guild) return;
      
      // Check if this is an RP thread
      if (message.channel.isThread()) {
        try {
          const { handleRPPostTracking } = require('./modules/rpQuestTrackingModule');
          await handleRPPostTracking(message);
        } catch (error) {
          console.error("[index.js]: Error tracking RP post:", error);
        }
      }
    });

    // --------------------------------------------------------------------------
    // Leveling System - XP Tracking
    // --------------------------------------------------------------------------
    client.on("messageCreate", async (message) => {
      if (message.author.bot) return;
      if (!message.guild) return;
      
      try {
        // Handle XP tracking for leveling system
        const { handleXP } = require('./modules/levelingModule');
        await handleXP(message);
        
        // Handle existing message tracking
        const { trackLastMessage } = require('./utils/messageUtils');
        await trackLastMessage(message);
      } catch (error) {
        console.error("[index.js]: Error handling XP tracking:", error);
      }
    });

    // --------------------------------------------------------------------------
    // Welcome Message System
    // --------------------------------------------------------------------------
    client.on("guildMemberAdd", async (member) => {
      try {
        // Create welcome embed
        const { EmbedBuilder } = require('discord.js');
        
        const welcomeEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle(`🌱 Welcome to ${member.guild.name}, ${member.user.username}!`)
          .setDescription(`We're glad to have you here! Roots of the Wild is a Zelda-inspired RP where your OCs help shape the world.`)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .addFields(
            {
              name: '🗺️ **Start Here**',
              value: '• Please check the **rules** channel to unlock the server\n• Post your intro in the **intro** channel\n• Come hang out in **gossip-stone** chat\n• Questions? DM Roots.Admin#9069 or post in **faq-and-suggestions**',
              inline: false
            },
            {
              name: '⏳ **Two Week Timer**',
              value: 'You have **2 weeks** to submit a character application. After that, you\'ll be removed to make space for others. Apps don\'t need to be perfect—just started!',
              inline: false
            },
            {
              name: '📜 **Quick Rules**',
              value: '• 18+ server only\n• NSFW belongs in designated channels\n• No godmodding or metagaming\n• Respect pronouns & fellow members\n• Avoid heavy real-world topics (check trigger list)\n• Use "Windfish says No" to end upsetting convos\n• No AI art in apps or official submissions',
              inline: false
            },
            {
              name: '🔗 **Full Rules + Site**',
              value: 'https://www.rootsofthewild.com/',
              inline: false
            }
          )
          .setFooter({
            text: 'Take Courage. • Be Wise. • Nurture Power. • 🌿 Welcome to Roots!',
            icon_url: client.user.displayAvatarURL()
          })
          .setTimestamp();

        // Send welcome message as DM
        await member.send({ embeds: [welcomeEmbed] });
        
        console.log(`[index.js]: 🌱 Welcome message sent to ${member.user.tag} (${member.id})`);
        
      } catch (error) {
        console.error(`[index.js]: ❌ Error sending welcome message to ${member.user.tag}:`, error);
        // If DM fails, we could send to a welcome channel instead
        // For now, just log the error
      }
    });

    // --------------------------------------------------------------------------
    // Raid Thread Slow Mode Management
    // --------------------------------------------------------------------------
    // Enable slow mode on raid threads when they're created
    client.on("threadCreate", async (thread) => {
      try {
        // Check if this thread is associated with a raid (thread name contains raid indicators)
        const threadName = thread.name.toLowerCase();
        const isRaidThread = threadName.includes('🛡️') || 
                             threadName.includes('raid') || 
                             threadName.includes('rudania') || 
                             threadName.includes('inariko') || 
                             threadName.includes('vhintl');
        
        if (isRaidThread) {
          // Enable 10-second slow mode on the thread
          await thread.setRateLimitPerUser(10);
          console.log(`[index.js]: ⏰ Enabled 10-second slow mode on raid thread: ${thread.name} (${thread.id})`);
        }
      } catch (error) {
        console.error(`[index.js]: ❌ Error enabling slow mode on raid thread:`, error);
      }
    });

    // --------------------------------------------------------------------------
    // User Data Cleanup on Server Leave
    // --------------------------------------------------------------------------
    // Delete all user data when they leave the server
    client.on("guildMemberRemove", async (member) => {
      try {
        const discordId = member.user.id;
        const username = member.user.tag;
        
        console.log(`[index.js]: 🗑️ User ${username} (${discordId}) left the server. Starting data cleanup...`);
        
        // Import necessary models
        const User = require('./models/UserModel');
        const Character = require('./models/CharacterModel');
        const ModCharacter = require('./models/ModCharacterModel');
        const Pet = require('./models/PetModel');
        const Mount = require('./models/MountModel');
        const initializeInventoryModel = require('./models/InventoryModel');
        const initializeVendingModel = require('./models/VendingModel');
        const Quest = require('./models/QuestModel');
        const Party = require('./models/PartyModel');
        const MinigameModel = require('./models/MinigameModel');
        const RuuGame = require('./models/RuuGameModel');
        const StealStats = require('./models/StealStatsModel');
        const BlightRollHistory = require('./models/BlightRollHistoryModel');
        const ApprovedSubmission = require('./models/ApprovedSubmissionModel');
        const Raid = require('./models/RaidModel');
        
        // Initialize inventory and vending models
        const { model: Inventory } = await initializeInventoryModel();
        const { model: VendingInventory } = await initializeVendingModel();
        
        // Get all characters for this user (needed for cascading deletes)
        const characters = await Character.find({ userId: discordId });
        const characterIds = characters.map(char => char._id);
        const characterNames = characters.map(char => char.name);
        
        // Get all mod characters for this user
        const modCharacters = await ModCharacter.find({ userId: discordId });
        const modCharacterIds = modCharacters.map(char => char._id);
        const modCharacterNames = modCharacters.map(char => char.name);
        
        // Combine all character IDs and names
        const allCharacterIds = [...characterIds, ...modCharacterIds];
        const allCharacterNames = [...characterNames, ...modCharacterNames];
        
        // Delete data from all collections
        const deletionResults = {};
        
        // 1. Delete user data
        const userResult = await User.deleteMany({ discordId: discordId });
        deletionResults.users = userResult.deletedCount;
        
        // 2. Delete characters
        const characterResult = await Character.deleteMany({ userId: discordId });
        deletionResults.characters = characterResult.deletedCount;
        
        // 3. Delete mod characters
        const modCharacterResult = await ModCharacter.deleteMany({ userId: discordId });
        deletionResults.modCharacters = modCharacterResult.deletedCount;
        
        // 4. Delete inventories (for all characters)
        if (allCharacterIds.length > 0) {
          const inventoryResult = await Inventory.deleteMany({ 
            characterId: { $in: allCharacterIds } 
          });
          deletionResults.inventoryItems = inventoryResult.deletedCount;
        } else {
          deletionResults.inventoryItems = 0;
        }
        
        // 5. Delete vending inventories (by character names)
        if (allCharacterNames.length > 0) {
          const vendingResult = await VendingInventory.deleteMany({ 
            characterName: { $in: allCharacterNames } 
          });
          deletionResults.vendingItems = vendingResult.deletedCount;
        } else {
          deletionResults.vendingItems = 0;
        }
        
        // 6. Delete pets
        const petResult = await Pet.deleteMany({ discordId: discordId });
        deletionResults.pets = petResult.deletedCount;
        
        // 7. Delete mounts
        const mountResult = await Mount.deleteMany({ discordId: discordId });
        deletionResults.mounts = mountResult.deletedCount;
        
        // 8. Remove user from active quests
        const questUpdateResult = await Quest.updateMany(
          { 'party.userId': discordId },
          { $pull: { party: { userId: discordId } } }
        );
        deletionResults.questsUpdated = questUpdateResult.modifiedCount;
        
        // 9. Remove user from parties or delete if they're the leader
        // First, delete parties where user is the leader
        const partyDeleteResult = await Party.deleteMany({ leaderId: discordId });
        deletionResults.partiesDeleted = partyDeleteResult.deletedCount;
        
        // Then remove user from other parties
        const partyUpdateResult = await Party.updateMany(
          { 'characters.userId': discordId },
          { $pull: { characters: { userId: discordId } } }
        );
        deletionResults.partiesUpdated = partyUpdateResult.modifiedCount;
        
        // Finally, delete parties that have no characters left
        const emptyPartyDeleteResult = await Party.deleteMany({ 
          characters: { $size: 0 } 
        });
        deletionResults.emptyPartiesDeleted = emptyPartyDeleteResult.deletedCount;
        
        // 10. Delete minigame data
        const minigameResult = await MinigameModel.updateMany(
          {},
          { $pull: { leaderboard: { discordId: discordId } } }
        );
        deletionResults.minigameEntriesRemoved = minigameResult.modifiedCount;
        
        // 11. Delete Ruu Game data
        const ruuGameResult = await RuuGame.updateMany(
          {},
          { $pull: { leaderboard: { discordId: discordId } } }
        );
        deletionResults.ruuGameEntriesRemoved = ruuGameResult.modifiedCount;
        
        // 12. Delete steal stats (by characterId)
        let stealStatsResult = { deletedCount: 0 };
        if (allCharacterIds.length > 0) {
          stealStatsResult = await StealStats.deleteMany({ 
            characterId: { $in: allCharacterIds }
          });
        }
        deletionResults.stealStats = stealStatsResult.deletedCount;
        
        // 13. Delete blight roll history
        const blightRollResult = await BlightRollHistory.deleteMany({ userId: discordId });
        deletionResults.blightRolls = blightRollResult.deletedCount;
        
        // 14. Delete temporary data associated with this user
        const tempDataResult = await TempData.deleteMany({
          $or: [
            { 'data.userId': discordId },
            { 'data.discordId': discordId },
            { 'data.participants.userId': discordId }
          ]
        });
        deletionResults.tempData = tempDataResult.deletedCount;
        
        // 15. Delete approved submissions by this user
        const approvedSubmissionResult = await ApprovedSubmission.deleteMany({ userId: discordId });
        deletionResults.approvedSubmissions = approvedSubmissionResult.deletedCount;
        
        // 16. Remove user from active raids or delete raids they're in
        const raidUpdateResult = await Raid.updateMany(
          { 'participants.userId': discordId },
          { $pull: { participants: { userId: discordId } } }
        );
        deletionResults.raidsUpdated = raidUpdateResult.modifiedCount;
        
        // Delete raids that have no participants left
        const emptyRaidDeleteResult = await Raid.deleteMany({ 
          participants: { $size: 0 } 
        });
        deletionResults.emptyRaidsDeleted = emptyRaidDeleteResult.deletedCount;
        
        // Log summary of deletions
        console.log(`[index.js]: ✅ Data cleanup completed for ${username} (${discordId}):`);
        console.log(`[index.js]:    - Users: ${deletionResults.users}`);
        console.log(`[index.js]:    - Characters: ${deletionResults.characters}`);
        console.log(`[index.js]:    - Mod Characters: ${deletionResults.modCharacters}`);
        console.log(`[index.js]:    - Inventory Items: ${deletionResults.inventoryItems}`);
        console.log(`[index.js]:    - Vending Items: ${deletionResults.vendingItems}`);
        console.log(`[index.js]:    - Pets: ${deletionResults.pets}`);
        console.log(`[index.js]:    - Mounts: ${deletionResults.mounts}`);
        console.log(`[index.js]:    - Quests Updated: ${deletionResults.questsUpdated}`);
        console.log(`[index.js]:    - Parties Deleted (as leader): ${deletionResults.partiesDeleted}`);
        console.log(`[index.js]:    - Parties Updated (removed from): ${deletionResults.partiesUpdated}`);
        console.log(`[index.js]:    - Empty Parties Cleaned Up: ${deletionResults.emptyPartiesDeleted}`);
        console.log(`[index.js]:    - Minigame Entries: ${deletionResults.minigameEntriesRemoved}`);
        console.log(`[index.js]:    - Ruu Game Entries: ${deletionResults.ruuGameEntriesRemoved}`);
        console.log(`[index.js]:    - Steal Stats: ${deletionResults.stealStats}`);
        console.log(`[index.js]:    - Blight Rolls: ${deletionResults.blightRolls}`);
        console.log(`[index.js]:    - Temp Data: ${deletionResults.tempData}`);
        console.log(`[index.js]:    - Approved Submissions: ${deletionResults.approvedSubmissions}`);
        console.log(`[index.js]:    - Raids Updated (removed from): ${deletionResults.raidsUpdated}`);
        console.log(`[index.js]:    - Empty Raids Cleaned Up: ${deletionResults.emptyRaidsDeleted}`);
        
      } catch (error) {
        console.error(`[index.js]: ❌ Error during user data cleanup for ${member.user.tag}:`, error);
        handleError(error, 'index.js', {
          operation: 'guildMemberRemove',
          userId: member.user.id,
          username: member.user.tag
        });
      }
    });

    // --------------------------------------------------------------------------
    // Start the Bot
    // --------------------------------------------------------------------------
    try {
      logger.info('SYSTEM', 'Attempting to login to Discord...');
      await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
      console.error('[index.js]: ❌ Failed to login to Discord:', error);
      if (error.code === 'TokenInvalid') {
        console.error('[index.js]: ❌ Invalid Discord token. Please check your DISCORD_TOKEN environment variable.');
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('[index.js]: ❌ Fatal error during initialization:', error);
    process.exit(1);
  }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// Brief description: Logging and utilities.
// ============================================================================
function logBloodMoonStatus() {
  const today = new Date();
  const hyruleanDate = convertToHyruleanDate(today);
  let isBloodMoon = false;

  try {
    isBloodMoon = isBloodMoonDay();
  } catch (error) {
    handleError(error, "index.js", {
      operation: 'blood_moon_check',
      context: 'scheduler_and_encounters'
    });
    console.error("[index.js]: ❌ Blood Moon check failed:", error.message);
  }

  // Only log if it's a blood moon day
  if (isBloodMoon) {
    console.log(`[index.js]: 🌕 Blood Moon Active (${hyruleanDate})`);
  }
}

initializeClient();
