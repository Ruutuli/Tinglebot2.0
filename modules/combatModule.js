// ============================================================================
// Combat Module - Design Rules & Goals
// ============================================================================
// RULES:
// • Attacks are simultaneous? If not, an initiative system will have to be made.
// • Stamina recovers one wedge at a time, IF it wasn’t used last turn.
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
// • The chosen dice are unconventional, but since an online dice bot can roll any type, it’s acceptable.
// • Consider if attacks should cost stamina; if so, adjust stamina recovery to +1 per turn so flurry rushes still cost stamina.
// • Explore other uses for stamina, such as a bidding system for initiative or bracing to lower damage.
// • Decide how to do damage: 1 heart per hit is simple, but at higher levels, fights could go on too long.
// • The system is designed so that characters with better gear have a significant advantage,
//   similar to how BotW works (e.g., fighting a Hinoc with a broom is a losing battle).
// • The combat system is meant to be fun and serve as an accessory to roleplay.
// • The simple stat system (with four main stats) allows for easy scaling of monster stats for boss fights.
// ============================================================================

// ============================================================================
// Combat Module
// This module manages combat operations such as storing battle progress,
// updating battle states, and handling PvP combat turns.
// ============================================================================

// ------------------- Standard Libraries -------------------
// Node.js core modules for file system and path operations.
const fs = require('fs');
const { handleError } = require('../utils/globalErrorHandler');
const path = require('path');

// ------------------- Modules -------------------
// Character statistics and status management.
const { handleKO, useHearts, useStamina } = require('../modules/characterStatsModule');
const { getGearModLevel } = require('../modules/gearModule');

// ------------------- Utility Functions -------------------
// Unique ID generation for battle IDs.
const { generateUniqueId } = require('../utils/uniqueIdUtils');

// ------------------- Configuration Constants -------------------
// Define file path for storing battle progress.
const BATTLE_PROGRESS_PATH = path.join(__dirname, '..', 'data', 'battleProgress.json');

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
    handleError(error, 'combatModule.js');

      fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify({}));
    }
  }
}

// ============================================================================
// Battle Progress Storage Functions
// ------------------- Store Battle Progress -------------------
// Saves battle progress data and returns a unique battle ID.
async function storeBattleProgress(character, monster, tier, monsterHearts, progress) {
  ensureBattleProgressFileExists();
  const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));
  
  // Generate a unique battle ID with "B" prefix.
  const battleId = generateUniqueId('B');
  
  battleProgress[battleId] = {
    battleId,
    characters: [character], // Full character object stored
    monster: monster.name,
    tier: tier,
    monsterHearts: {
      max: monster.hearts,
      current: monsterHearts.current,
    },
    progress: progress ? `\n${progress}` : '',
  };

  try {
    fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));
  } catch (err) {
    handleError(err, 'combatModule.js');

    console.error(`[combatModule.js]: ❌ Error storing battle progress for Battle ID "${battleId}":`, err);
    throw err;
  }
  return battleId;
}

// ------------------- Get Battle Progress by ID -------------------
// Retrieves battle progress using the given battle ID.
// Handles both PvP and legacy/raid formats.
async function getBattleProgressById(battleId) {
  ensureBattleProgressFileExists();
  const raw = fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8');
  const battleProgress = JSON.parse(raw);

  if (battleProgress[battleId]) {
    return battleProgress[battleId];
  }

  // Handle legacy/raid-style format (if applicable)
  if (battleProgress.battleId === battleId) {
    console.warn(`[combatModule.js]: ⚠️ Legacy battle format detected for ID ${battleId}`);
    return battleProgress;
  }

  console.error(`[combatModule.js]: ❌ Error - No battle progress found for Battle ID: ${battleId}`);
  return null;
}

// ------------------- Update Battle Progress -------------------
// Updates battle progress: deducts monster hearts, updates character hearts,
// and appends new progress information.
async function updateBattleProgress(battleId, updatedProgress, outcome) {
  ensureBattleProgressFileExists();
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
    fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));
  } catch (err) {
    handleError(err, 'combatModule.js');

    console.error(`[combatModule.js]: ❌ Error updating battle progress for Battle ID "${battleId}":`, err);
    throw err;
  }
}

// ------------------- Delete Battle Progress -------------------
// Removes battle progress data for the specified battle ID.
async function deleteBattleProgressById(battleId) {
  ensureBattleProgressFileExists();
  try {
    const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));
    if (battleProgress[battleId]) {
      delete battleProgress[battleId];
      fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));
    }
  } catch (error) {
    handleError(error, 'combatModule.js');

    console.error(`[combatModule.js]: ❌ Error deleting battle progress for Battle ID "${battleId}":`, error);
  }
}

// ------------------- Update Monster Hearts to Zero -------------------
// Sets the monster's current hearts to zero for the specified battle.
async function updateMonsterHeartsToZero(battleId) {
  ensureBattleProgressFileExists();
  const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));
  if (battleProgress[battleId]) {
    battleProgress[battleId].monsterHearts.current = 0;
    try {
      fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));
    } catch (err) {
    handleError(err, 'combatModule.js');

      console.error(`[combatModule.js]: ❌ Error updating monster hearts for Battle ID "${battleId}":`, err);
      throw err;
    }
  }
}

// ============================================================================
// Utility Functions for Combat Calculations
// ------------------- Roll Weapon Dice -------------------
// Rolls a number of d6 based on the mod level and returns both the total and individual results.
function rollWeaponDice(modLevel) {
  const rolls = [];
  for (let i = 0; i < modLevel; i++) {
    rolls.push(Math.floor(Math.random() * 6) + 1);
  }
  const total = rolls.reduce((sum, val) => sum + val, 0);
  return { total, rolls };
}

// ------------------- Get Total Defense -------------------
// Revised function to calculate total defense from a character's armor and shield.
// Uses the gearModule helper 'getGearModLevel' to correctly read gear modifiers.
function getTotalDefense(character) {
  let total = 0;
  
  if (!character.gearArmor) {
    console.log(`[combatModule.js]: debug - ${character.name} has no gearArmor defined, defaulting armor defense to 0.`);
  } else {
    ['head', 'chest', 'legs'].forEach(slot => {
      const gearPiece = character.gearArmor[slot];
      if (gearPiece) {
        // Use the helper to get the modifier from the gear's stats.
        const modValue = getGearModLevel(gearPiece);
        if (modValue === 0) {
          console.log(`[combatModule.js]: debug - ${character.name} gear in slot ${slot} returned mod value 0.`);
        }
        total += modValue;
      } else {
        console.log(`[combatModule.js]: debug - ${character.name} has no gear for slot ${slot}, defaulting to 0.`);
      }
    });
  }
  
  if (!character.gearShield) {
    console.log(`[combatModule.js]: debug - ${character.name} has no gearShield defined, defaulting shield defense to 0.`);
  } else {
    // Use the helper for shield as well.
    const shieldMod = getGearModLevel(character.gearShield);
    if (shieldMod === 0) {
      console.log(`[combatModule.js]: debug - ${character.name}'s shield returned mod value 0.`);
    }
    total += shieldMod;
  }
  
  return total;
}


// ------------------- Get Weapon Modifier -------------------
// Retrieves the weapon modifier from the character's gear.
function getWeaponMod(character) {
  if (!character.gearWeapon) {
    console.log(`[combatModule.js]: debug - ${character.name} has no gearWeapon, defaulting weapon mod to 0.`);
    return 0;
  }
  const mod = getGearModLevel(character.gearWeapon);
  console.log(`[combatModule.js]: debug - ${character.name}'s computed weapon mod from gearModule: ${mod}`);
  return mod;
}

// ------------------- Is Flurry Trigger -------------------
// Determines if the roll qualifies for a flurry trigger based on thresholds.
function isFlurryTrigger(rollTotal, modLevel, flurryCount = 0) {
  const flurryThresholds = {
    1: [6],
    2: [11, 12],
    3: [16, 17, 18],
    4: [20, 21, 22, 23, 24]
  };

  const thresholds = flurryThresholds[modLevel] || [];
  const adjustedThresholds = thresholds.map(val => val - flurryCount);
  return adjustedThresholds.includes(rollTotal);
}

// ============================================================================
// PvP Battle Logic Functions
// ------------------- Start PvP Battle -------------------
// Initializes a PvP battle between two characters and stores the battle data.
async function startPvPBattle(attacker, defender) {
  ensureBattleProgressFileExists();
  const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));

  const battleId = generateUniqueId('C'); // 'C' prefix for combat
  const updatedBattle = {
    battleId,
    type: 'PvP',
    characters: { attacker, defender },
    log: [`⚔️ **${attacker.name}** has challenged **${defender.name}** to battle!`],
    currentTurn: attacker._id
  };

  battleProgress[battleId] = updatedBattle;

  try {
    fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));
  } catch (err) {
    handleError(err, 'combatModule.js');

    console.error(`[combatModule.js]: ❌ Error starting PvP battle for Battle ID "${battleId}":`, err);
    throw err;
  }
  return battleId;
}

// ------------------- Take PvP Turn -------------------
// Processes a PvP turn by rolling dice, calculating damage, and handling flurry attacks.
async function takePvPTurn(battleId, attacker, defender) {
  ensureBattleProgressFileExists();
  const battleProgress = await getBattleProgressById(battleId);
  if (!battleProgress) return { error: 'Battle not found.' };

  // If defender is not provided, retrieve from stored battle data.
  if (!defender) {
    defender = battleProgress.characters.defender;
  }

  // ------------------- Logging Attacker and Defender Stats -------------------
  const attackerMod = getWeaponMod(attacker);
  console.log(`[combatModule.js]: debug - Attacker ${attacker.name} stats: weaponMod: ${attackerMod}, currentStamina: ${attacker.currentStamina}, currentHearts: ${attacker.currentHearts}`);
  console.log(`[combatModule.js]: debug - Attacker ${attacker.name} gear info: gearArmor: ${JSON.stringify(attacker.gearArmor)}, gearShield: ${JSON.stringify(attacker.gearShield)}, gearWeapon: ${JSON.stringify(attacker.gearWeapon)}`);

  const defenderDefense = getTotalDefense(defender);
  console.log(`[combatModule.js]: debug - Defender ${defender.name} stats: computed defense: ${defenderDefense}, gearArmor: ${JSON.stringify(defender.gearArmor)}, gearShield: ${JSON.stringify(defender.gearShield)}`);

  if (attacker.currentStamina <= 0) {
    const skipLog = `⚠️ ${attacker.name} is out of stamina and cannot attack!`;
    battleProgress.log.push(skipLog);
    try {
      fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));
    } catch (err) {
    handleError(err, 'combatModule.js');

      console.error(`[combatModule.js]: ❌ Error updating battle log for Battle ID "${battleId}":`, err);
      throw err;
    }
    return { message: skipLog };
  }

  let { total: totalRoll, rolls } = rollWeaponDice(attackerMod);
  const overage = totalRoll - defenderDefense;  
  console.log(`[combatModule.js]: debug - Initial dice roll: ${totalRoll}, overage: ${overage}`);

  let log = `🎲 **${attacker.name}** rolls **${totalRoll}** (${rolls.join(' + ')}) vs **${defender.name}'s** defense (**${defenderDefense}**)`;
  let hearts = 0;

  if (overage > 0) {
    hearts = Math.floor(overage);
    await useHearts(defender._id, hearts);
    log += ` — Hit! ❤️ **${hearts}** hearts of damage dealt!`;
    console.log(`[combatModule.js]: debug - Damage calculation: rolled ${totalRoll}, defense ${defenderDefense}, hearts damage: ${hearts}`);
    if (defender.currentHearts - hearts <= 0) {
      await handleKO(defender._id);
      log += ` 💀 **${defender.name}** has been KO'd!`;
      console.log(`[combatModule.js]: debug - ${defender.name} KO'd after attack.`);
    }
  } else {
    log += ` — ❌ Miss! No damage.`;
    console.log(`[combatModule.js]: debug - No damage inflicted. Rolled ${totalRoll} vs defense ${defenderDefense}.`);
  }

  // ------------------- Flurry Rush Mechanic with Detailed Logging -------------------
  let flurryCount = 0;
  let staminaCost = 1;
  while (isFlurryTrigger(totalRoll, attackerMod, flurryCount)) {
    if (attacker.currentStamina < staminaCost) {
      console.log(`[combatModule.js]: debug - Not enough stamina for flurry. Required: ${staminaCost}, Available: ${attacker.currentStamina}`);
      break;
    }
    await useStamina(attacker._id, staminaCost);
    flurryCount++;
    console.log(`[combatModule.js]: debug - FlurryRush #${flurryCount}: Used ${staminaCost} stamina. New stamina: ${attacker.currentStamina}`);

    const flurryRollResult = rollWeaponDice(attackerMod);
    totalRoll = flurryRollResult.total;
    const flurryRolls = flurryRollResult.rolls;    
    const flurryOverage = totalRoll - defenderDefense;
    const flurryHearts = flurryOverage > 0 ? Math.floor(flurryOverage) : 0;
    console.log(`[combatModule.js]: debug - FlurryRush #${flurryCount}: Rolled ${totalRoll}, overage: ${flurryOverage}, flurryHearts: ${flurryHearts}`);

    if (flurryHearts > 0) {
      await useHearts(defender._id, flurryHearts);
      hearts += flurryHearts;
      log += `\n⚡ Flurry Rush #${flurryCount}! Rolled **${totalRoll}** (${flurryRolls.join(' + ')}), dealt **${flurryHearts}** more hearts!`;
      if (defender.currentHearts - hearts <= 0) {
        await handleKO(defender._id);
        log += ` 💀 **${defender.name}** has been KO'd!`;
        console.log(`[combatModule.js]: debug - ${defender.name} KO'd during flurry rush.`);
        break;
      }
    } else {
      log += `\n⚡ Flurry Rush #${flurryCount}! Rolled **${totalRoll}** (${flurryRolls.join(' + ')}), missed.`;
      break;
    }
    staminaCost++;
  }

  battleProgress.log.push(log);
  battleProgress.currentTurn = defender._id; // Switch turn

  try {
    fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));
  } catch (err) {
    handleError(err, 'combatModule.js');

    console.error(`[combatModule.js]: ❌ Error updating battle log after turn for Battle ID "${battleId}":`, err);
    throw err;
  }
  return { message: log };
}

// ============================================================================
// Module Exports
// ------------------- Exported Functions -------------------
// Battle Progress Functions and PvP Combat Operations.
module.exports = {
  storeBattleProgress,
  getBattleProgressById,
  updateBattleProgress,
  deleteBattleProgressById,
  updateMonsterHeartsToZero,
  startPvPBattle,
  takePvPTurn,
  getTotalDefense
};
