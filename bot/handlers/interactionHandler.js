// ============================================================================
// ------------------- Imports -------------------
// Organized and grouped per 2025 coding standards.
// ============================================================================

const { EmbedBuilder } = require('discord.js');

const { connectToInventories, connectToTinglebot } = require('@/database/db');

const { handleError } = require('@/utils/globalErrorHandler');

const { handleAutocomplete } = require('../handlers/autocompleteHandler');
const { handleComponentInteraction } = require('../handlers/componentHandler');
const { handleItemLookupInteraction } = require('../handlers/itemLookupHandler');

const BOT_REPORTS_CHANNEL_ID = '1379974822506795030';
const IMPLEMENTATION_TRACK_MESSAGE_ID = '1381442926667763773';


// ============================================================================
// ------------------- Function: handleInteraction -------------------
// Main entry point for all Discord interaction events (buttons, slash, autocomplete).
// ============================================================================
const handleInteraction = async (interaction, client) => {
  try {
    if (interaction.isButton()) {
      const { customId } = interaction;
      const [command] = customId.split('|');

      console.log(`[interactionHandler.js]: 🔄 Processing button interaction: ${customId}`);

      if (command === 'lookup') {
        await handleItemLookupInteraction(interaction);
      } else {
        await handleComponentInteraction(interaction);
      }
    } else if (interaction.isCommand() || interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        console.warn(`[interactionHandler.js]: ⚠️ Unknown command: ${interaction.commandName}`);
        return;
      }

      if (interaction.isAutocomplete()) {
        console.log(`[interactionHandler.js]: 🔄 Processing autocomplete for: ${interaction.commandName}`);
        await connectToTinglebot();
        await handleAutocomplete(interaction);
      } else {
        console.log(`[interactionHandler.js]: 🔄 Processing command: ${interaction.commandName}`);
        await connectToTinglebot();
        await connectToInventories();
        await command.execute(interaction);
      }
    }
  } catch (error) {
    handleError(error, 'interactionHandler.js');
    console.error(`[interactionHandler.js]: ❌ Error during interaction handling: ${error.message}`);

    try {
      if (interaction.isAutocomplete()) {
        await interaction.respond([]);
      } else if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ **There was an error while executing this command!**',
          flags: 64 // 64 is the flag for ephemeral messages
        });
      } else if (!interaction.replied) {
        await interaction.followUp({
          content: '❌ **There was an error while executing this command!**',
          flags: 64 // 64 is the flag for ephemeral messages
        });
      }
    } catch (err) {
      handleError(err, 'interactionHandler.js');
      console.error(`[interactionHandler.js]: ❌ Error responding to interaction: ${err.message}`);
    }
  }
};


// ============================================================================
// ------------------- Function: initializeReactionHandler -------------------
// Listens for emoji reactions on messages and processes them accordingly.
// ============================================================================
const initializeReactionHandler = (client) => {
  client.on('messageReactionAdd', async (reaction, user) => {
    try {
      if (user.bot) return;

      if (reaction.message.partial) await reaction.message.fetch();
      if (reaction.partial) await reaction.fetch();
      
      // Healing request cancellation logic
      if (reaction.emoji.name === '❌') {
        // Try to fetch healing request by message ID
        const { retrieveHealingRequestFromStorage, saveHealingRequestToStorage } = require('@/utils/storage');
        const { createHealEmbed } = require('../embeds/embeds.js');
        const healingRequest = await retrieveHealingRequestFromStorage(reaction.message.id);
        if (healingRequest && healingRequest.status === 'pending') {
          healingRequest.status = 'cancelled';
          await saveHealingRequestToStorage(healingRequest.healingRequestId, healingRequest);
          // Update the embed to show cancellation
          const embed = await createHealEmbed(null, { ...healingRequest, name: healingRequest.characterRequesting }, healingRequest.heartsToHeal, healingRequest.paymentOffered, healingRequest.healingRequestId, null, 'cancelled');
          await reaction.message.edit({ embeds: [embed] });
        }
      }

      // Bot-reports channel: specific implementation-tracking message reactions
      const isX = reaction.emoji.name === '❌' || reaction.emoji.name === '✖️';
      const isCheckmark = reaction.emoji.name === '✅' || reaction.emoji.name === '☑️' || reaction.emoji.name === '✔️' ||
        reaction.emoji.id === '854499720797618207';
      if (
        reaction.message.channel.id === BOT_REPORTS_CHANNEL_ID &&
        reaction.message.id === IMPLEMENTATION_TRACK_MESSAGE_ID &&
        isCheckmark
      ) {
        await reaction.message.reply('This has been implemented.');
      } else if (
        reaction.message.channel.id === BOT_REPORTS_CHANNEL_ID &&
        reaction.message.id === IMPLEMENTATION_TRACK_MESSAGE_ID &&
        isX
      ) {
        await reaction.message.reply(
          'The mod team has decided not to implement this. If you would like to know why, feel free to ask.'
        );
      } else if (reaction.message.channel.id === BOT_REPORTS_CHANNEL_ID && isCheckmark) {
        const bugFixedEmbed = new EmbedBuilder()
          .setColor(0x57F287) // green
          .setTitle('Bug fixed')
          .setDescription('This bug has been fixed! If you are still having issues with it, please rereport it.');
        await reaction.message.reply({ embeds: [bugFixedEmbed] });
      }

      // Help Wanted quest completion logic - run on any checkmark in submissions channel (mod or bot)
      if (reaction.emoji.name === '✅' || reaction.emoji.name === '☑️' || reaction.emoji.name === '✔️') {
        // Check if this is a submission message in the submissions channel
        if (reaction.message.channel.id === '940446392789389362') { // Submissions channel ID
          console.log('[interactionHandler.js]: ✅ Checkmark reaction detected on submission - checking for quest completion');

          const messageUrl = `https://discord.com/channels/${reaction.message.guildId}/${reaction.message.channelId}/${reaction.message.id}`;
          const { retrieveSubmissionFromStorage } = require('@/utils/storage');
          const { checkAndCompleteQuestFromSubmission } = require('../modules/helpWantedModule');

          const embed = reaction.message.embeds[0];
          if (embed && embed.fields) {
            const submissionIdField = embed.fields.find(field => field.name === 'Submission ID' || field.name === '🆔 Submission ID');
            if (submissionIdField) {
              const submissionId = submissionIdField.value.replace(/`/g, '').trim();
              console.log(`[interactionHandler.js]: Found submission ID: ${submissionId}`);

              try {
                let submissionData = await retrieveSubmissionFromStorage(submissionId);
                if (!submissionData) {
                  const ApprovedSubmission = require('@/models/ApprovedSubmissionModel');
                  const approved = await ApprovedSubmission.findOne({ submissionId }).lean();
                  if (approved) {
                    submissionData = {
                      submissionId: approved.submissionId,
                      questEvent: approved.questEvent || 'N/A',
                      category: approved.category,
                      userId: approved.userId,
                      messageUrl: approved.messageUrl || messageUrl,
                    };
                  }
                }
                if (submissionData) {
                  submissionData.messageUrl = messageUrl;
                  submissionData.approvedSubmissionData = true;

                  if (submissionData.blightId && submissionData.blightId !== 'N/A') {
                    console.log(`[interactionHandler.js]: Submission ${submissionId} has blightId ${submissionData.blightId} - user must use /blight submit to complete healing`);
                  }

                  if (submissionData.questEvent && submissionData.questEvent !== 'N/A') {
                    await checkAndCompleteQuestFromSubmission(submissionData, client);
                  }
                }
              } catch (error) {
                console.error(`[interactionHandler.js]: Error retrieving submission data for ${submissionId}:`, error);
              }
            }
          }
        }
      }

    } catch (error) {
      handleError(error, 'interactionHandler.js');
      console.error('[interactionHandler.js]: ❌ Error in reaction handler', error);
    }
  });
};


// ============================================================================
// ------------------- Module Exports -------------------
// Exports core interaction functions.
// ============================================================================
module.exports = {
  handleInteraction,
  initializeReactionHandler
};
