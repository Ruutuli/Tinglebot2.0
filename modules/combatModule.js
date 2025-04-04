// ------------------- combatModule.js -------------------
// This module manages combat-related operations. It stores battle progress,
// retrieves and updates battle status, and handles battle outcomes (such as updating hearts and KO status).
// The battle progress is stored in a JSON file.

// ============================================================================
// Standard Libraries
// ------------------- Importing Node.js core modules -------------------
const fs = require('fs');            // For file system operations
const path = require('path');        // For handling file paths

// ============================================================================
// Database Models & Modules
// ------------------- Importing local modules and models -------------------
const Monster = require('../models/MonsterModel');  // Monster data model
const { useHearts, handleKO } = require('../modules/characterStatsModule');  // Character stat management
const { calculateAttackBuff, calculateDefenseBuff, applyBuffs } = require('../modules/buffModule');  // Buff logic
const { generateUniqueId } = require('../utils/uniqueIdUtils');  // Unique ID generation

// ============================================================================
// Constants
// ------------------- Define file paths and configuration constants -------------------
const BATTLE_PROGRESS_PATH = path.join(__dirname, '..', 'data', 'battleProgress.json');  // JSON file for battle progress

// ============================================================================
// File Initialization Functions
// ------------------- Ensure Battle Progress File Exists -------------------
// Checks if the battle progress file exists and creates or repairs it if necessary.
function ensureBattleProgressFileExists() {
  if (!fs.existsSync(BATTLE_PROGRESS_PATH)) {
    fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify({}));
  } else {
    try {
      JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));
    } catch (error) {
      fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify({}));
    }
  }
}

// ============================================================================
// Battle Progress Storage Functions
// ------------------- Store Battle Progress -------------------
// Stores battle progress for a battle, including character and monster states, then returns a unique battle ID.
async function storeBattleProgress(character, monster, tier, monsterHearts, progress) {
  ensureBattleProgressFileExists();
  const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));
  
  // Generate a unique battle ID with "R" prefix using a utility function.
  const battleId = generateUniqueId('R');
  
  battleProgress[battleId] = {
    battleId,
    characters: [character], // Stores full character object
    monster: monster.name,
    tier: tier,
    monsterHearts: {
      max: monster.hearts,
      current: monsterHearts.current,
    },
    progress: progress ? `\n${progress}` : '',
  };

  fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));
  console.log(`[combatModule.js]: logs Battle ID "${battleId}" stored successfully.`);
  return battleId;
}

// ------------------- Get Battle Progress by ID -------------------
// Retrieves the battle progress for a specific battle ID.
async function getBattleProgressById(battleId) {
  ensureBattleProgressFileExists();
  const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));
  if (!battleProgress[battleId]) {
    console.error(`[combatModule.js]: logs Error: No battle progress found for Battle ID: ${battleId}`);
    return null;
  }
  return battleProgress[battleId];
}

// ------------------- Update Battle Progress -------------------
// Updates battle progress by deducting monster hearts, updating character hearts,
// and appending new progress information.
async function updateBattleProgress(battleId, updatedProgress, outcome) {
  ensureBattleProgressFileExists();
  const battleProgress = await getBattleProgressById(battleId);
  
  // Deduct monster hearts without going below zero.
  battleProgress.monsterHearts.current = Math.max(battleProgress.monsterHearts.current - (outcome.hearts || 0), 0);

  // If hearts are deducted, update the character's hearts and trigger KO if needed.
  if (outcome.hearts) {
    await useHearts(outcome.character._id, outcome.hearts);
    if (outcome.character.currentHearts === 0) {
      await handleKO(outcome.character._id);
      battleProgress.progress += `\n${outcome.character.name} has been KO'd!`;
    }
  }
  
  battleProgress.progress += `\n${updatedProgress}`;
  fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));
}

// ------------------- Delete Battle Progress -------------------
// Deletes battle progress data for a given battle ID.
async function deleteBattleProgressById(battleId) {
  ensureBattleProgressFileExists();
  try {
    const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));
    if (battleProgress[battleId]) {
      delete battleProgress[battleId];
      fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));
    }
  } catch (error) {
    // Minimal error logging; additional handling can be added if needed.
  }
}

// ------------------- Generate Unique Battle ID -------------------
// Generates a simple unique battle ID based on the current timestamp.
function generateBattleId() {
  return Date.now().toString();
}

// ------------------- Update Monster Hearts to Zero -------------------
// Sets the monster's current hearts to zero for the specified battle.
async function updateMonsterHeartsToZero(battleId) {
  ensureBattleProgressFileExists();
  const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));
  if (battleProgress[battleId]) {
    battleProgress[battleId].monsterHearts.current = 0;
    fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));
  }
}

// ============================================================================
// Module Exports
// ------------------- Exporting combat module functions -------------------
module.exports = {
  storeBattleProgress,
  getBattleProgressById,
  generateBattleId,
  updateBattleProgress,
  deleteBattleProgressById,
  updateMonsterHeartsToZero
};
