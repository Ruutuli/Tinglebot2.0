// ------------------- Import necessary modules and handlers -------------------
const { handleAutocomplete } = require('../handlers/autocompleteHandler');
const { connectToTinglebot, connectToInventories } = require('../database/connection');
const { handleComponentInteraction } = require('../handlers/componentHandler');
const { createCharacterInteraction } = require('../handlers/characterInteractionHandler');
const { handleItemLookupInteraction } = require('../handlers/itemLookupHandler');

// ------------------- Handle different types of interactions -------------------
const handleInteraction = async (interaction, client) => {
  try {

    // Handle button interactions
    if (interaction.isButton()) {
      console.log("Processing button interaction");
      const { customId } = interaction;
      const [command] = customId.split('|');
      console.log(`Command: ${command}`);

      if (command === 'lookup') {
        await handleItemLookupInteraction(interaction);
      } else {
        await handleComponentInteraction(interaction);
      }
    } else if (interaction.isCommand() || interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        console.log("Command not found");
        return;
      }

      // Handle autocomplete interactions
      if (interaction.isAutocomplete()) {
        await connectToTinglebot(); // Ensure DB connection
        await handleAutocomplete(interaction);
      }
      // Handle normal slash commands
      else {
        await connectToTinglebot();
        await connectToInventories(); // Load both DB connections if needed
        await command.execute(interaction);
      }
    }
  } catch (error) {
    console.error('❌ Error during interaction handling:', error);

    try {
      if (interaction.isAutocomplete()) {
        await interaction.respond([]); // Respond with an empty array to avoid "Unknown interaction" error
      } else if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
      } else if (!interaction.replied) {
        await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
      }
    } catch (err) {
      console.error('❌ Error responding to interaction:', err);
    }
  }
};

module.exports = {
  handleInteraction,
};
