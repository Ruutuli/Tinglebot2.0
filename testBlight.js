// ------------------- Imports -------------------
const { connectToTinglebot, connectToInventories } = require('./database/connection'); // Adjust the path if necessary
const Character = require('./models/CharacterModel');  // Adjust the path to CharacterModel if necessary

// ------------------- Update Characters -------------------
async function updateAllCharacters() {
  try {
    // Connect to the Tinglebot database
    await connectToTinglebot();
    console.log('✅ Connected to the Tinglebot database.');

    // Fetch all characters
    const characters = await Character.find({});
    console.log(`🔄 Processing ${characters.length} characters to adjust blight...\n`);

    // Iterate over each character
    for (const character of characters) {
      // Apply blight to characters owned by user 211219306137124865
      if (character.userId === '211219306137124865') { // Ensure this field matches the userId field in the character schema
        character.blighted = true;
        character.blightStage = 1;
        character.lastRollDate = null; // Reset the lastRollDate
        console.log(`🔵 Set blight to Stage 1 for ${character.name} (Owner: 211219306137124865)`);
      } else {
        character.blighted = false;
        character.blightStage = 0;
        character.lastRollDate = null; // Clear the lastRollDate
        console.log(`🟢 Removed blight from ${character.name}`);
      }
      await character.save(); // Save the updated character
    }

    console.log(`\n✅ Successfully updated characters. Blight adjusted for all based on ownership by user 211219306137124865.`);
  } catch (error) {
    console.error('❌ Error updating characters:', error);
  } finally {
    // Close the database connections
    process.exit();
  }
}

// ------------------- Run the Update -------------------
updateAllCharacters();
