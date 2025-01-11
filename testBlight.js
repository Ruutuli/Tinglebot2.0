// ------------------- Imports -------------------
const { connectToTinglebot, connectToInventories } = require('./database/connection'); // Adjust the path if necessary
const Character = require('./models/CharacterModel');  // Adjust the path to CharacterModel if necessary

// ------------------- Generate Random Blight Stage -------------------
function getRandomBlightStage() {
  return Math.floor(Math.random() * 4) + 1; // Generates a random number between 1 and 4
}

// ------------------- Update All Characters -------------------
async function updateAllCharacters() {
  try {
    // Connect to the Tinglebot database
    await connectToTinglebot();
    console.log('✅ Connected to the Tinglebot database.');

    // Fetch all characters
    const characters = await Character.find({});
    console.log(`🔄 Updating ${characters.length} characters...\n`);

    // Iterate over each character, randomize the blight stage, and reset lastRollDate
    for (const character of characters) {
      const randomBlightStage = getRandomBlightStage();
      character.blighted = true;
      character.blightStage = randomBlightStage;
      character.lastRollDate = null; // Reset the lastRollDate
      await character.save(); // Save the updated character

      // Log the character name, assigned blight stage, and reset lastRollDate
      console.log(`🟢 ${character.name} -> Blight Stage: ${randomBlightStage}, lastRollDate reset.`);
    }

    console.log(`\n✅ Successfully updated ${characters.length} characters with randomized blight stages and reset lastRollDate.`);
  } catch (error) {
    console.error('❌ Error updating characters:', error);
  } finally {
    // Close the database connections
    process.exit();
  }
}

// ------------------- Run the Update -------------------
updateAllCharacters();
