// utils/jailCheck.js

/**
 * Checks if a character is in jail. If so, it sends an error message
 * and returns true to signal that no further processing should occur.
 * Otherwise, it returns false.
 */
function enforceJail(interaction, character) {
    if (character.inJail) {
      interaction.editReply({
        content: `❌ **${character.name} is currently in jail and cannot perform this action. Please wait until you are released.**`,
        ephemeral: true,
      });
      return true;
    }
    return false;
  }
  
  module.exports = { enforceJail };
  