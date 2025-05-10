// ============================================================================
// Raid Combat Module - Design Rules & Goals
// ============================================================================
// RULES:
// • Attacks are simultaneous? If not, an initiative system will have to be made.
// • Stamina recovers one wedge at a time, IF it wasn't used last turn.
// • It does NOT cost stamina to attack, but if you have 0 stamina, you may not attack.
//   (Note: If you have 0 stamina, you get hit for free.)
// • The attack roll MUST exceed defense, not merely match it. 
//   (e.g., if defense is 4, you must roll a 5 or higher.)
// • If the attack roll is successful, the attack does 1 heart of damage.
//   Alternative: Damage is dealt in quarters, and you deal as many quarters as you
//   beat the target by. For example: if you needed a 5 but rolled a 12, this deals
//   7 quarter-hearts of damage, or 1¾ hearts. (Method TBD)
// • TBD: Add the weapon mod to your rolls? For example, level 1 is 1+d6, level 2 is 2+d12.
// • Weapon styles:
//     - 1-handed weapon: gets a shield to add to total defense. If flurry rush triggers,
//       you may add 1 to the flurry rush trigger number for each successive flurry rush.
//     - 2-handed weapons: double the weapon mod if using that method; deals extra damage.
//       (E.g., if a 1-handed attack does 1 heart, a 2H might do 1½ hearts, or if using quarters,
//        2H deals in halves.)
//     - Bow and Arrows: add weapon mods to defense (representing distance), but damage dealt
//       is lower. (If damage is in 1-heart increments, the bow does ½; if using quarters, cut the
//       total in half and round up. Balance based on how many bows can attack more than once.)
// 
// PRINCIPLES / GOALS:
// • Make the combat system as efficient as possible while reducing the number of rolls.
// • Weapon styles are a core design element; without them, 1H weapons and shields will always be best.
// • To be refined: Should weapon mods be added to the roll? If so, adjust the dice accordingly.
// • The chosen dice are unconventional, but since an online dice bot can roll any type, it's acceptable.
// • Consider if attacks should cost stamina; if so, adjust stamina recovery to +1 per turn so flurry rushes still cost stamina.
// • Explore other uses for stamina, such as a bidding system for initiative or bracing to lower damage.
// • Decide how to do damage: 1 heart per hit is simple, but at higher levels, fights could go on too long.
// • The system is designed so that characters with better gear have a significant advantage,
//   similar to how BotW works (e.g., fighting a Hinoc with a broom is a losing battle).
// • The combat system is meant to be fun and serve as an accessory to roleplay.
// • The simple stat system (with four main stats) allows for easy scaling of monster stats for boss fights.
// ============================================================================

// ============================================================================
// Raid Combat Module
// This module manages raid combat operations such as storing battle progress,
// updating battle states, and handling raid combat turns.
// ============================================================================

// ------------------- Standard Libraries -------------------
// Node.js core modules for file system and path operations.
const fs = require('fs');
const { handleError } = require('../utils/globalErrorHandler');
const path = require('path');

// ------------------- Modules -------------------
// Character statistics and status management.
const { handleKO, useHearts } = require('../modules/characterStatsModule');
const { getGearModLevel } = require('../modules/gearModule');

// ------------------- Utility Functions -------------------
// Unique ID generation for battle IDs.
const { generateUniqueId } = require('../utils/uniqueIdUtils');

// ------------------- Storage Functions -------------------
const { 
  saveBattleProgressToStorage, 
  retrieveBattleProgressFromStorage, 
  deleteBattleProgressFromStorage 
} = require('../utils/storage.js');

// ============================================================================
// File Initialization Functions
// ------------------- Ensure Battle Progress File Exists -------------------
// Checks and initializes the battle progress file.
function ensureBattleProgressFileExists() {
  if (!fs.existsSync(BATTLE_PROGRESS_PATH)) {
    fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify({}));
  } else {
    try {
      JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));
    } catch (error) {
      handleError(error, 'raidCombatModule.js');
      fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify({}));
    }
  }
}

// ============================================================================
// Battle Progress Storage Functions
// ============================================================================

// ------------------- Store Battle Progress -------------------
// Saves battle progress data and returns a unique battle ID.
async function storeBattleProgress(character, monster, tier, monsterHearts, progress) {
  // Generate a unique battle ID with "R" prefix.
  const battleId = generateUniqueId('R');
  
  const battleData = {
    battleId,
    characters: [character], // Full character object stored
    monster: monster.name,
    tier: tier,
    monsterHearts: {
      max: monster.hearts,
      current: monsterHearts.current,
    },
    progress: progress ? `\n${progress}` : '',
    isBloodMoon: false,
    startTime: Date.now()
  };

  try {
    await saveBattleProgressToStorage(battleId, battleData);
  } catch (err) {
    handleError(err, 'raidCombatModule.js');
    console.error(`[raidCombatModule.js]: ❌ Error storing battle progress for Battle ID "${battleId}":`, err);
    throw err;
  }
  return battleId;
}

// ------------------- Get Battle Progress by ID -------------------
// Retrieves battle progress using the given battle ID.
async function getBattleProgressById(battleId) {
  try {
    const battleProgress = await retrieveBattleProgressFromStorage(battleId);
    if (!battleProgress) {
      console.error(`[raidCombatModule.js]: ❌ Error - No battle progress found for Battle ID: ${battleId}`);
      return null;
    }
    return battleProgress;
  } catch (error) {
    handleError(error, 'raidCombatModule.js');
    console.error(`[raidCombatModule.js]: ❌ Error retrieving battle progress for Battle ID "${battleId}":`, error);
    return null;
  }
}

// ------------------- Update Battle Progress -------------------
// Updates battle progress: deducts monster hearts, updates character hearts,
// and appends new progress information.
async function updateBattleProgress(battleId, updatedProgress, outcome) {
  const battleProgress = await getBattleProgressById(battleId);
  if (!battleProgress) return;

  // Deduct monster hearts without dropping below zero.
  battleProgress.monsterHearts.current = Math.max(battleProgress.monsterHearts.current - (outcome.hearts || 0), 0);

  // If damage was dealt, update character hearts and check for KO.
  if (outcome.hearts) {
    await useHearts(outcome.character._id, outcome.hearts);
    if (outcome.character.currentHearts === 0) {
      await handleKO(outcome.character._id);
      battleProgress.progress += `\n${outcome.character.name} has been KO'd!`;
    }
  }
  
  battleProgress.progress += `\n${updatedProgress}`;
  
  try {
    await saveBattleProgressToStorage(battleId, battleProgress);
  } catch (err) {
    handleError(err, 'raidCombatModule.js');
    console.error(`[raidCombatModule.js]: ❌ Error updating battle progress for Battle ID "${battleId}":`, err);
    throw err;
  }
}

// ------------------- Delete Battle Progress -------------------
// Removes battle progress data for the specified battle ID.
async function deleteBattleProgressById(battleId) {
  try {
    await deleteBattleProgressFromStorage(battleId);
  } catch (error) {
    handleError(error, 'raidCombatModule.js');
    console.error(`[raidCombatModule.js]: ❌ Error deleting battle progress for Battle ID "${battleId}":`, error);
  }
}

// ------------------- Update Monster Hearts to Zero -------------------
// Sets the monster's current hearts to zero for the specified battle.
async function updateMonsterHeartsToZero(battleId) {
  const battleProgress = await getBattleProgressById(battleId);
  if (battleProgress) {
    battleProgress.monsterHearts.current = 0;
    try {
      await saveBattleProgressToStorage(battleId, battleProgress);
    } catch (err) {
      handleError(err, 'raidCombatModule.js');
      console.error(`[raidCombatModule.js]: ❌ Error updating monster hearts for Battle ID "${battleId}":`, err);
      throw err;
    }
  }
}

// ============================================================================
// Utility Functions for Combat Calculations
// ------------------- Roll Weapon Dice -------------------
function rollWeaponDice(modLevel) {
  const rolls = [];
  for (let i = 0; i < modLevel; i++) {
    rolls.push(Math.floor(Math.random() * 6) + 1);
  }
  const total = rolls.reduce((sum, val) => sum + val, 0);
  return { total, rolls };
}

// ------------------- Get Total Defense -------------------
function getTotalDefense(character) {
  let total = 0;
  
  if (!character.gearArmor) {
    console.log(`[raidCombatModule.js]: debug - ${character.name} has no gearArmor defined, defaulting armor defense to 0.`);
  } else {
    ['head', 'chest', 'legs'].forEach(slot => {
      const gearPiece = character.gearArmor[slot];
      if (gearPiece) {
        const modValue = getGearModLevel(gearPiece);
        if (modValue === 0) {
          console.log(`[raidCombatModule.js]: debug - ${character.name} gear in slot ${slot} returned mod value 0.`);
        }
        total += modValue;
      } else {
        console.log(`[raidCombatModule.js]: debug - ${character.name} has no gear for slot ${slot}, defaulting to 0.`);
      }
    });
  }
  
  if (!character.gearShield) {
    console.log(`[raidCombatModule.js]: debug - ${character.name} has no gearShield defined, defaulting shield defense to 0.`);
  } else {
    const shieldMod = getGearModLevel(character.gearShield);
    if (shieldMod === 0) {
      console.log(`[raidCombatModule.js]: debug - ${character.name}'s shield returned mod value 0.`);
    }
    total += shieldMod;
  }
  
  return total;
}

// ------------------- Get Weapon Mod -------------------
function getWeaponMod(character) {
  if (!character.gearWeapon) {
    console.log(`[raidCombatModule.js]: debug - ${character.name} has no gearWeapon defined, defaulting weapon mod to 0.`);
    return 0;
  }
  return getGearModLevel(character.gearWeapon);
}

// ------------------- Check Flurry Trigger -------------------
function isFlurryTrigger(rollTotal, modLevel, flurryCount = 0) {
  const baseTrigger = 12 - modLevel;
  const adjustedTrigger = baseTrigger - flurryCount;
  return rollTotal >= adjustedTrigger;
}

// ============================================================================
// Raid Battle Functions
// ------------------- Start Raid Battle -------------------
async function startRaidBattle(character, monster) {
  const battleId = await storeBattleProgress(
    character, 
    monster, 
    monster.tier, 
    { current: monster.hearts }, 
    'Raid Battle initiated'
  );
  return battleId;
}

// ------------------- Take Raid Turn -------------------
async function takeRaidTurn(battleId, character, monster) {
  const battleProgress = await getBattleProgressById(battleId);
  if (!battleProgress) return null;

  const weaponMod = getWeaponMod(character);
  const { total: rollTotal, rolls } = rollWeaponDice(weaponMod);
  const defense = monster.defense || 0;

  const outcome = {
    attacker: character.name,
    defender: monster.name,
    rollTotal,
    rolls,
    defense,
    success: rollTotal > defense,
    hearts: rollTotal > defense ? 1 : 0,
    character: character
  };

  await updateBattleProgress(battleId, 
    `${character.name} rolled ${rollTotal} (${rolls.join(', ')}) against ${monster.name}'s defense of ${defense}. ` +
    `${outcome.success ? 'Hit!' : 'Miss!'}`, 
    outcome
  );

  return outcome;
}

module.exports = {
  storeBattleProgress,
  getBattleProgressById,
  updateBattleProgress,
  deleteBattleProgressById,
  updateMonsterHeartsToZero,
  rollWeaponDice,
  getTotalDefense,
  getWeaponMod,
  isFlurryTrigger,
  startRaidBattle,
  takeRaidTurn
}; 