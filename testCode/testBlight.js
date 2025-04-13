// ------------------- Imports -------------------
const { connectToTinglebot, connectToInventories } = require('../database/connection'); // Adjust the path if necessary
const Character = require('../models/CharacterModel'); // Adjust the path to CharacterModel if necessary

// ------------------- Update All Characters with Blight -------------------
async function updateAllCharacters() {
  try {
    // Connect to the Tinglebot database
    await connectToTinglebot();
    console.log('✅ Connected to the Tinglebot database.');

    // Fetch all characters
    const characters = await Character.find({});
    console.log(`🔄 Processing ${characters.length} characters to apply blight...\n`);

    // Iterate over each character
    for (const character of characters) {
      character.blighted = true;
      character.blightStage = 1;
      character.lastRollDate = null; // Reset the lastRollDate
      console.log(`💀 Blighted ${character.name} | Stage: 1`);

      await character.save(); // Save the updated character
    }

    console.log(`\n✅ Successfully blighted all characters in the database.`);
  } catch (error) {
    console.error('❌ Error updating characters:', error);
  } finally {
    // Close the database connections
    process.exit();
  }
}

// ------------------- Run the Update -------------------
updateAllCharacters();
