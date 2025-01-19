// ------------------- Standard and Third-Party Imports -------------------
const fs = require('fs');  // For file system operations
const path = require('path');  // For handling and transforming file paths
const Monster = require('../models/MonsterModel');  // Model for handling monster data
const { useHearts, handleKO } = require('../modules/characterStatsModule');  // Import functions to manage character hearts and KO status
const { calculateAttackBuff, calculateDefenseBuff, applyBuffs } = require('../modules/buffModule');  // Buff-related logic
const { generateUniqueId } = require('../utils/uniqueIdUtils');

// ------------------- Constants -------------------
const BATTLE_PROGRESS_PATH = path.join(__dirname, '..', 'data', 'battleProgress.json');  // Path to the JSON file for storing battle progress

// ------------------- Ensure Battle Progress File Exists -------------------
// Ensures the battle progress file exists, creating it if necessary
function ensureBattleProgressFileExists() {
    if (!fs.existsSync(BATTLE_PROGRESS_PATH)) {
        fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify({}));  // Create an empty file if it doesn't exist
    } else {
        try {
            JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));  // Validate the existing file content
        } catch (error) {
            fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify({}));  // Overwrite the file if corrupted
        }
    }
}

// ------------------- Store Battle Progress in JSON -------------------
// Stores battle progress for a specific battle ID, including character and monster states
async function storeBattleProgress(character, monster, tier, monsterHearts, progress) {
    ensureBattleProgressFileExists();  // Ensure the file is ready for updates

    const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));  // Read existing battle progress

    // Generate a unique battle ID with "R" prefix
    const battleId = generateUniqueId('R');

    // Initialize a new entry if no progress exists for the battle ID
    battleProgress[battleId] = {
        battleId,
        characters: [character], // Store the full character object
        monster: monster.name,
        tier: tier,
        monsterHearts: {
            max: monster.hearts,
            current: monsterHearts.current,
        },
        progress: progress ? `\n${progress}` : '', // Initialize progress message
    };

    // Save the updated battle progress back to the JSON file
    fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));

    console.log(`[storeBattleProgress] Battle ID "${battleId}" stored successfully.`);
    return battleId; // Return the generated battle ID
}

// ------------------- Get Battle Progress by ID from JSON -------------------
// Retrieves the battle progress for a specific battle ID
async function getBattleProgressById(battleId) {
    ensureBattleProgressFileExists();  // Ensure the file is accessible

    const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));  // Read the file contents

    if (!battleProgress[battleId]) {
        console.error(`Error: No battle progress found for Battle ID: ${battleId}`);  // Error log if no progress found
        return null;
    }

    return battleProgress[battleId];  // Return the progress if found
}

// ------------------- Update Battle Progress in JSON -------------------
// Updates the battle progress with new information, including the outcome and hearts adjustment
async function updateBattleProgress(battleId, updatedProgress, outcome) {
    ensureBattleProgressFileExists();  // Ensure the file exists
    
    const battleProgress = await getBattleProgressById(battleId);  // Get the current progress

    // Deduct the monster's hearts based on the outcome, preventing negative heart values
    battleProgress.monsterHearts.current = Math.max(battleProgress.monsterHearts.current - (outcome.hearts || 0), 0);

    // Update the character's hearts and handle KO status if applicable
    if (outcome.hearts) {
        await useHearts(outcome.character._id, outcome.hearts);  // Deduct hearts from the character
        if (outcome.character.currentHearts === 0) {
            await handleKO(outcome.character._id);  // Trigger KO logic if hearts reach zero
            battleProgress.progress += `\n${outcome.character.name} has been KO'd!`;  // Add KO message to progress log
        }
    }

    // Append updated progress message
    battleProgress.progress += `\n${updatedProgress}`;

    // Save the updated progress back to the JSON file
    fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));
}

// ------------------- Delete Battle Progress -------------------
// Deletes the battle progress for a specific battle ID
async function deleteBattleProgressById(battleId) {
    ensureBattleProgressFileExists(); // Ensure the file exists
    try {
        const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8')); // Read existing data
        if (battleProgress[battleId]) {
            delete battleProgress[battleId]; // Delete the entry
            fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2)); // Save changes
        } else {
        }
    } catch (error) {
    }
}

// ------------------- Generate Unique Battle ID -------------------
// Generates a unique battle ID based on the current timestamp
function generateBattleId() {
    return Date.now().toString();  // Simple timestamp-based ID generation
}

// ------------------- Update Monster Hearts to Zero -------------------
// Sets the monster's hearts to zero for a specific battle ID
async function updateMonsterHeartsToZero(battleId) {
    ensureBattleProgressFileExists();  // Ensure the file exists

    const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));  // Read the progress data

    // If progress exists for the battle ID, update the monster's hearts to zero
    if (battleProgress[battleId]) {
        battleProgress[battleId].monsterHearts.current = 0;  // Set monster hearts to zero
        fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));  // Save the updated progress
    }
}

// ------------------- Export all functions for external use -------------------
module.exports = {
    storeBattleProgress,
    getBattleProgressById,
    generateBattleId,
    updateBattleProgress,
    deleteBattleProgressById,
    updateMonsterHeartsToZero
};
