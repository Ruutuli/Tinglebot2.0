// ------------------- Database Connections -------------------
// Functions used to establish connections with the database.
const { connectToInventories, connectToTinglebot } = require('../database/db');

const { handleError } = require('../utils/globalErrorHandler');
// ------------------- Handlers -------------------
// Custom handlers for processing various interaction types.
const { handleAutocomplete } = require('../handlers/autocompleteHandler');
const { handleComponentInteraction } = require('../handlers/componentHandler');
const { handleItemLookupInteraction } = require('../handlers/itemLookupHandler');


// ------------------- Interaction Handling -------------------
// This function processes different types of Discord interactions such as button clicks,
// slash commands, and autocomplete interactions. It ensures that necessary database connections
// are established before executing the appropriate command or handler.
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

      // Handle autocomplete interactions by ensuring a DB connection first.
      if (interaction.isAutocomplete()) {
        await connectToTinglebot();
        await handleAutocomplete(interaction);
      }
      // Handle standard slash commands by establishing both DB connections if needed.
      else {
        await connectToTinglebot();
        await connectToInventories();
        await command.execute(interaction);
      }
    }
  } catch (error) {
    handleError(error, 'interactionHandler.js');

    console.error("[interactionHandler]: ❌ Error during interaction handling:", error);

    try {
      if (interaction.isAutocomplete()) {
        await interaction.respond([]); // Respond with an empty array to avoid "Unknown interaction" error.
      } else if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ **There was an error while executing this command!**', ephemeral: true });
      } else if (!interaction.replied) {
        await interaction.followUp({ content: '❌ **There was an error while executing this command!**', ephemeral: true });
      }
    } catch (err) {
    handleError(err, 'interactionHandler.js');

      console.error("[interactionHandler]: ❌ Error responding to interaction:", err);
    }
  }
};

// ------------------- initializeReactionHandler -------------------
// Set up global reaction collectors (non-interaction based, like emoji reacts)
function initializeReactionHandler(client) {
  client.on('messageReactionAdd', async (reaction, user) => {
    try {
      if (user.bot) return;

      // Example: react-based role system (expand as needed)
      if (reaction.message.partial) await reaction.message.fetch();
      if (reaction.partial) await reaction.fetch();

      console.log(`[reactionHandler]: ${user.username} reacted with ${reaction.emoji.name} on message ${reaction.message.id}`);

      // You can route to specific logic here (e.g., match emoji/message/channel)
    } catch (error) {
      handleError(error, 'interactionHandler.js');
      console.error('[reactionHandler]: ❌ Error in reaction listener', error);
    }
  });
}


module.exports = {
  handleInteraction,
  initializeReactionHandler,
};
