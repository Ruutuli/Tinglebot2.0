// ------------------- Imports -------------------
const { connectToTinglebot, connectToInventories } = require('./database/connection'); // Adjust the path if necessary
const Character = require('./models/CharacterModel');  // Adjust the path to CharacterModel if necessary

// ------------------- Update All Characters -------------------
async function updateAllCharacters() {
  try {
    // Connect to the Tinglebot database
    await connectToTinglebot();
    console.log('✅ Connected to the Tinglebot database.');

    // Update all characters to be blighted: true and blightStage: 1
    const result = await Character.updateMany({}, {
      blighted: true,
      blightStage: 1
    });

    console.log(`✅ Successfully updated ${result.nModified} characters.`);
  } catch (error) {
    console.error('❌ Error updating characters:', error);
  } finally {
    // Close the database connections
    process.exit();
  }
}

// ------------------- Run the Update -------------------
updateAllCharacters();
