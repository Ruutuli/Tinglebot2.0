// ============================================================================
// ------------------- Imports -------------------
// Organized and grouped per 2025 coding standards.
// ============================================================================

const { connectToInventories, connectToTinglebot } = require('../database/db');

const { handleError } = require('../utils/globalErrorHandler');

const { handleAutocomplete } = require('../handlers/autocompleteHandler');
const { handleComponentInteraction } = require('../handlers/componentHandler');
const { handleItemLookupInteraction } = require('../handlers/itemLookupHandler');


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
      
      // TODO: Add routing logic here for specific emoji/message/channel reactions

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
