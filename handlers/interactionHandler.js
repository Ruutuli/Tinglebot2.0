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

      if (command === 'lookup') {
        await handleItemLookupInteraction(interaction);
      } else {
        await handleComponentInteraction(interaction);
      }
    } else if (interaction.isCommand() || interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        return;
      }

      if (interaction.isAutocomplete()) {
        await connectToTinglebot();
        await handleAutocomplete(interaction);
      } else {
        await connectToTinglebot();
        await connectToInventories();
        await command.execute(interaction);
      }
    }
  } catch (error) {
    handleError(error, 'interactionHandler.js');
    console.error('[interactionHandler.js]: ❌ Error during interaction handling', error);

    try {
      if (interaction.isAutocomplete()) {
        await interaction.respond([]);
      } else if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ **There was an error while executing this command!**',
          ephemeral: true
        });
      } else if (!interaction.replied) {
        await interaction.followUp({
          content: '❌ **There was an error while executing this command!**',
          ephemeral: true
        });
      }
    } catch (err) {
      handleError(err, 'interactionHandler.js');
      console.error('[interactionHandler.js]: ❌ Error responding to interaction', err);
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

      console.log(`[interactionHandler.js]: ${user.username} reacted with ${reaction.emoji.name} on message ${reaction.message.id}`);
      
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
