const fs = require('fs');
const path = require('path');
const { execute } = require(path.resolve(__dirname, './commands/loot'));
const { getAllVillages } = require('./modules/locationsModule');
const { updateCharacterById, fetchCharacterById } = require('./database/characterService');

// Character ID of the test character (Alden)
const characterId = "6686ea8f06daf7531045b4b2"; // Replace with the actual ID

// Jobs with the LOOTING perk
const jobsWithLooting = [
    { job: 'Adventurer', village: null },
    { job: 'Graveskeeper', village: null },
    { job: 'Guard', village: null },
    { job: 'Hunter', village: null },
    { job: 'Mercenary', village: null },
    { job: 'Scout', village: null },
];

// ------------------- Utility to Log Results -------------------
const logResults = (logData) => {
    const logFile = 'loot_test_results.txt';
    fs.writeFileSync(logFile, logData, { flag: 'w' });
    console.log(`✅ Test results saved to ${logFile}`);
};

// ------------------- Mock Interaction -------------------
class MockInteraction {
    constructor(userId, options) {
        this.user = { id: userId };
        this.options = {
            getString: (key) => options[key],
        };
        this.replyData = null;
    }

    async deferReply() {
        console.log('↪️ Deferring reply...');
    }

    async editReply(content) {
        this.replyData = content;
        console.log('.');
    }
}

// ------------------- Test Scenarios -------------------
const runTests = async () => {
    let logData = '';
    const userId = "211219306137124865"; // User ID for Alden

    try {
        const villages = getAllVillages(); // Get all villages

        for (const { job } of jobsWithLooting) {
            for (const village of villages) {
                for (let i = 0; i < 3; i++) { // Run each scenario 3x per job/village
                    const description = `Job: ${job}, Village: ${village}, Run: ${i + 1}`;

                    console.log(`🔍 Running Test: ${description}`);
                    const interaction = new MockInteraction(userId, { charactername: "Alden" });

                    // Update the character's job, village, and reset hearts
                    try {
                        console.log(`🛠 Updating character for Test: ${description}`);
                        await updateCharacterById(characterId, { job, currentVillage: village, currentHearts: 50 });

                        // Verify character update
                        const updatedCharacter = await fetchCharacterById(characterId);
                        console.log(`✅ Updated Job: ${updatedCharacter.job}, Village: ${updatedCharacter.currentVillage}`);
                    } catch (updateError) {
                        console.error(`❌ Failed to update character for ${description}:`, updateError.message);
                        logData += `Test: ${description}\nError: Failed to update character: ${updateError.message}\n\n`;
                        continue; // Skip to the next iteration if update fails
                    }

                    try {
                        await execute(interaction);

                        // Capture results
                        const result = interaction.replyData || 'No reply captured';
                        logData += `Test: ${description}\nResult: ${JSON.stringify(result, null, 2)}\n\n`;
                    } catch (error) {
                        console.error(`❌ Error in Test: ${description}:`, error.message);
                        logData += `Test: ${description}\nError: ${error.message}\n\n`;
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Error running tests:', error.message);
        logData += `Error running tests: ${error.message}\n`;
    } finally {
        logResults(logData); // Write results to file
        process.exit(0); // Exit after tests complete
    }
};

// ------------------- Run the Tests -------------------
runTests();
