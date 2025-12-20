// ------------------- Import Section: Grouped based on standard and local modules -------------------
// Standard libraries (Discord.js builders)
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, InteractionResponseType } = require('discord.js');

// Local modules (blight handlers)
const { 
  rollForBlightProgression, 
  healBlight, 
  submitHealingTask, 
  viewBlightHistory,
  viewBlightStatus,
  validateCharacterOwnership,
  loadBlightSubmissions
} = require('../../handlers/blightHandler');
const { fetchCharacterByNameAndUserId, getCharacterBlightHistory } = require('../../database/db-bot.js');
const { getModCharacterByName } = require('../../modules/modCharacters');
const { retrieveBlightRequestFromStorage } = require('../../utils/storage');
const Character = require('../../models/CharacterModel');
const { handleInteractionError } = require('../../utils/globalErrorHandler');

// ------------------- Helper function to safely respond to interactions -------------------
async function safeInteractionResponse(interaction, content, options = {}) {
  try {
    // Check if interaction is still valid
    if (!interaction.isRepliable()) {
      console.log('[blight.js]: Interaction is no longer repliable');
      return false;
    }

    // If we haven't replied yet, try to defer
    if (!interaction.deferred && !interaction.replied) {
      try {
        await interaction.deferReply({ flags: options.ephemeral ? [4096] : [] });
        return true;
      } catch (deferError) {
        console.error('[blight.js]: Failed to defer reply:', deferError);
        // If defer fails, try immediate reply
        try {
          await interaction.reply({ 
            content, 
            flags: options.ephemeral ? [4096] : [] // 4096 = MessageFlags.Ephemeral
          });
          return true;
        } catch (replyError) {
          console.error('[blight.js]: Failed to reply:', replyError);
          return false;
        }
      }
    }

    // If already deferred, edit the reply
    if (interaction.deferred && !interaction.replied) {
      try {
        await interaction.editReply({ 
          content, 
          flags: options.ephemeral ? [4096] : []
        });
        return true;
      } catch (editError) {
        console.error('[blight.js]: Failed to edit reply:', editError);
        return false;
      }
    }

    // If already replied, try follow up
    if (interaction.replied) {
      try {
        await interaction.followUp({ 
          content, 
          flags: options.ephemeral ? [4096] : []
        });
        return true;
      } catch (followUpError) {
        console.error('[blight.js]: Failed to follow up:', followUpError);
        return false;
      }
    }

    return false;
  } catch (error) {
    console.error('[blight.js]: Error in safeInteractionResponse:', error);
    return false;
  }
}

// ------------------- Define the Blight Command -------------------
// This command manages blight progression, healing, and submission of healing tasks.
module.exports = {
  // ------------------- Set up the slash command with subcommands -------------------
  data: new SlashCommandBuilder()
    .setName('blight')
    .setDescription('Manage blight progression, healing, and submissions.')

    // ------------------- Subcommand: Roll for blight progression -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('roll')
        .setDescription('Roll for blight progression for a specific character')
        .addStringOption(option =>
          option.setName('character_name')
            .setDescription('The name of the character to roll for blight progression')
            .setRequired(true)
            .setAutocomplete(true)))
    // ------------------- Subcommand: Heal a character from blight -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('heal')
        .setDescription('Request blight healing from a Mod Character')
        .addStringOption(option =>
          option.setName('character_name')
            .setDescription('The name of the character to heal from blight')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(option =>
          option.setName('healer_name')
            .setDescription('Select the healer performing the healing')
            .setRequired(true)
            .addChoices(
              { name: 'Aemu - Rudania', value: 'Aemu' },
              { name: 'Darune - Rudania', value: 'Darune' },
              { name: 'Elde - Vhintl', value: 'Elde' },
              { name: 'Foras - Vhintl', value: 'Foras' },
              { name: 'Ginger - Vhintl', value: 'Ginger-Sage' },
              { name: 'Korelii - Inariko', value: 'Korelii' },
              { name: 'Nihme - Inariko', value: 'Nihme' },
              { name: 'Sahira - Rudania', value: 'Sahira' },
              { name: 'Sanskar - Inariko', value: 'Sanskar' },
              { name: 'Sigrid - Inariko', value: 'Sigrid' }
            )))

    // ------------------- Subcommand: Submit a completed task for blight healing -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('submit')
        .setDescription('Submit a completed task for healing a character from blight')
        .addStringOption(option =>
          option.setName('submission_id')
            .setDescription('The submission ID you received when the task was assigned')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('item')
            .setDescription('The item you are offering for healing (if required)')
            .setAutocomplete(true)
            .setRequired(false))
        .addStringOption(option =>
          option.setName('link')
            .setDescription('Provide the link to your writing or art submission (if required)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('tokens')
            .setDescription('Forfeit all tokens in exchange for healing')
            .setRequired(false)))

    // ------------------- Subcommand: View blight history -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('history')
        .setDescription('View the blight history for a character')
        .addStringOption(option =>
          option.setName('character_name')
            .setDescription('The name of the character to view blight history for')
            .setRequired(true)
            .setAutocomplete(true))
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of history entries to show (default: 10)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)))

    // ------------------- Subcommand: View blight status -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('View the current blight status for a character')
        .addStringOption(option =>
          option.setName('character_name')
            .setDescription('The name of the character to view blight status for')
            .setRequired(true)
            .setAutocomplete(true)))

    // ------------------- Subcommand: View blighted characters roster -------------------
    .addSubcommand(subcommand =>
      subcommand
        .setName('roster')
        .setDescription('View all currently blighted characters in the world')
        .addBooleanOption(option =>
          option.setName('show_expired')
            .setDescription('Show expired healing submissions (default: false)')
            .setRequired(false))),

  // ------------------- Execute the command -------------------
  async execute(interaction) {
    // Check if interaction is still valid
    if (!interaction.isRepliable()) {
      console.log('[blight.js]: Interaction is no longer repliable, skipping execution');
      return;
    }

    try {
      // Defer reply immediately for all subcommands to prevent timeout
      try {
        await interaction.deferReply({ flags: [] });
      } catch (deferError) {
        console.error('[blight.js]: Failed to defer reply:', deferError);
        // If defer fails, try immediate reply
        try {
          await interaction.reply({ 
            content: '⚠️ Processing your request...', 
            flags: []
          });
        } catch (replyError) {
          console.error('[blight.js]: Failed to reply after defer failure:', replyError);
          return; // Can't proceed if we can't respond
        }
      }

      const subcommand = interaction.options.getSubcommand();
      
      if (subcommand === 'roll') {
        const characterName = interaction.options.getString('character_name');
        const character = await validateCharacterOwnership(interaction, characterName);
        if (!character) return;
        
        await rollForBlightProgression(interaction, characterName);
      
      } else if (subcommand === 'heal') {
        const characterName = interaction.options.getString('character_name');
        const character = await validateCharacterOwnership(interaction, characterName);
        if (!character) return;
        
        const healerName = interaction.options.getString('healer_name');
        await healBlight(interaction, characterName, healerName);
          
      } else if (subcommand === 'submit') {
        const submissionId = interaction.options.getString('submission_id');
        const item = interaction.options.getString('item');
        const link = interaction.options.getString('link');
        const tokens = interaction.options.getBoolean('tokens');
        await submitHealingTask(interaction, submissionId, item, link, tokens);
        
      } else if (subcommand === 'history') {
        const characterName = interaction.options.getString('character_name');
        const character = await validateCharacterOwnership(interaction, characterName);
        if (!character) return;
        
        const limit = interaction.options.getInteger('limit') || 10;
        await viewBlightHistory(interaction, characterName, limit);

      } else if (subcommand === 'status') {
        const characterName = interaction.options.getString('character_name');
        const character = await validateCharacterOwnership(interaction, characterName);
        if (!character) return;
        
        await viewBlightStatus(interaction, characterName);

      } else if (subcommand === 'roster') {
        try {
          // Get all blighted characters
          const blightedCharacters = await Character.find({ blighted: true });
          
          if (blightedCharacters.length === 0) {
            await interaction.editReply({
              content: '✅ There are currently no blighted characters in the world.',
              flags: []
            });
            return;
          }

          // Get all blight submissions
          const blightSubmissions = await loadBlightSubmissions();
          const showExpired = interaction.options.getBoolean('show_expired') || false;

          // Group characters by village
          const charactersByVillage = blightedCharacters.reduce((acc, char) => {
            const village = char.currentVillage || 'Unknown Village';
            if (!acc[village]) {
              acc[village] = [];
            }
            acc[village].push(char);
            return acc;
          }, {});

          // Create the main embed
          const embed = new EmbedBuilder()
            .setColor('#AD1457')
            .setTitle('📋 Blighted Characters Roster')
            .setDescription(`Total Blighted Characters: ${blightedCharacters.length}`)
            .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
            .setFooter({ text: 'Blighted Characters Roster' })
            .setTimestamp();

          // Add fields for each village
          for (const [village, characters] of Object.entries(charactersByVillage)) {
            let villageField = '';
            
            for (const char of characters) {
              // Get submission status
              const submission = Object.values(blightSubmissions).find(
                sub => sub.characterName === char.name && 
                (showExpired ? true : sub.status === 'pending')
              );

              // Get stage emoji
              const stageEmoji = char.blightStage === 5 ? '☠️' : 
                               char.blightStage === 4 ? '💀' :
                               char.blightStage === 3 ? '👻' :
                               char.blightStage === 2 ? '🎯' : '⚠️';

              // Format character info
              villageField += `${stageEmoji} **${char.name}** - Stage ${char.blightStage}\n`;
              
              if (submission) {
                const status = submission.status === 'pending' ? '🔄' : '⏰';
                const timeLeft = submission.status === 'pending' ? 
                  `(<t:${Math.floor(new Date(submission.expiresAt).getTime() / 1000)}:R>)` : 
                  '(Expired)';
                villageField += `└ ${status} Pending healing from **${submission.healerName}** ${timeLeft}\n`;
              }

              if (char.blightStage === 5 && char.deathDeadline) {
                villageField += `└ ⚰️ Death deadline: <t:${Math.floor(char.deathDeadline.getTime() / 1000)}:R>\n`;
              }

              villageField += '\n';
            }

            // Split field if too long
            if (villageField.length > 1024) {
              const chunks = villageField.match(/.{1,1024}/g) || [];
              for (let i = 0; i < chunks.length; i++) {
                embed.addFields({
                  name: i === 0 ? `🏰 ${village}` : `${village} (continued)`,
                  value: chunks[i]
                });
              }
            } else {
              embed.addFields({
                name: `🏰 ${village}`,
                value: villageField
              });
            }
          }

          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error('[blight.js]: ❌ Error fetching blighted roster:', error);
          
          let rosterErrorMessage = '❌ **Blighted Roster Error**\n\n';
          rosterErrorMessage += '**Error Type**: Roster Fetch Error\n';
          rosterErrorMessage += '**What Happened**: The system couldn\'t retrieve the blighted characters list.\n';
          rosterErrorMessage += '**How to Fix**: Please try again in a few moments.\n\n';
          
          rosterErrorMessage += '**Troubleshooting Steps**:\n';
          rosterErrorMessage += '1. Wait a few moments and try again\n';
          rosterErrorMessage += '2. Check if the bot is responding in other channels\n';
          rosterErrorMessage += '3. Contact a moderator if the issue persists\n\n';
          
          rosterErrorMessage += '**Technical Details** (for moderators):\n';
          rosterErrorMessage += `- Error: ${error.message || 'Unknown error'}\n`;
          rosterErrorMessage += `- User: ${interaction.user.tag} (${interaction.user.id})\n`;
          rosterErrorMessage += `- Timestamp: ${new Date().toISOString()}`;
          
          await safeInteractionResponse(interaction, rosterErrorMessage, { ephemeral: true });
        }
      }
    } catch (error) {
      console.error(`[blight.js]: Error executing blight command:`, error);
      
      // Create a detailed error message
      let errorMessage = '❌ **Blight Command Error**\n\n';
      
      // Add specific error details based on error type
      if (error.code === 'InteractionAlreadyReplied') {
        errorMessage += '**Error Type**: Interaction Already Replied\n';
        errorMessage += '**What Happened**: The system tried to respond to your command multiple times.\n';
        errorMessage += '**How to Fix**: Please try your command again. If the issue persists, wait a few moments before trying again.\n';
      } else if (error.name === 'ValidationError') {
        errorMessage += '**Error Type**: Data Validation Error\n';
        errorMessage += '**What Happened**: The system couldn\'t validate your command data.\n';
        errorMessage += '**How to Fix**: Please check your command parameters and try again.\n';
      } else if (error.name === 'CastError') {
        errorMessage += '**Error Type**: Data Type Error\n';
        errorMessage += '**What Happened**: The system encountered an issue with data formatting.\n';
        errorMessage += '**How to Fix**: Please ensure your command parameters are correct.\n';
      } else if (error.message && error.message.includes('timeout')) {
        errorMessage += '**Error Type**: Database Timeout\n';
        errorMessage += '**What Happened**: The system took too long to process your request.\n';
        errorMessage += '**How to Fix**: Please try again in a few moments.\n';
      } else if (error.message && error.message.includes('connection')) {
        errorMessage += '**Error Type**: Database Connection Error\n';
        errorMessage += '**What Happened**: The system couldn\'t connect to the database.\n';
        errorMessage += '**How to Fix**: Please try again later.\n';
      } else {
        errorMessage += '**Error Type**: Unexpected Error\n';
        errorMessage += '**What Happened**: Something went wrong while processing your request.\n';
        errorMessage += '**How to Fix**: Please try again. If the issue persists, contact a moderator.\n';
      }
      
      // Add command details for debugging
      errorMessage += '\n**Command Details**:\n';
      errorMessage += `- Subcommand: ${interaction.options.getSubcommand() || 'None'}\n`;
      errorMessage += `- User: ${interaction.user.tag} (${interaction.user.id})\n`;
      errorMessage += `- Channel: ${interaction.channel?.name || 'Unknown'}\n`;
      
      // Add troubleshooting steps
      errorMessage += '\n**Troubleshooting Steps**:\n';
      errorMessage += '1. Check your command parameters\n';
      errorMessage += '2. Ensure you have the required permissions\n';
      errorMessage += '3. Try the command again in a few moments\n';
      errorMessage += '4. Check if the bot is responding in other channels\n';
      
      // Add support information
      errorMessage += '\n**Need Help?**\n';
      errorMessage += '- Contact a moderator if the issue persists\n';
      errorMessage += '- Check the bot status in the server\n';
      errorMessage += '- Try using a different subcommand\n';
      
      // Add technical details for mods
      errorMessage += '\n**Technical Details** (for moderators):\n';
      errorMessage += `- Error: ${error.message || 'Unknown error'}\n`;
      errorMessage += `- Command: ${interaction.commandName || 'blight'}\n`;
      errorMessage += `- Timestamp: ${new Date().toISOString()}`;

      // Use the safe interaction response function
      await safeInteractionResponse(interaction, errorMessage, { ephemeral: true });
    }
  }
};
