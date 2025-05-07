// ============================================================================
// PVP Combat Module - Design Rules & Goals
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
// PVP Combat Module
// This module manages PVP and boss PVE combat operations such as storing battle progress,
// updating battle states, and handling combat turns.
// ============================================================================

// ------------------- Standard Libraries -------------------
const fs = require('fs');
const path = require('path');
const { handleError } = require('../utils/globalErrorHandler');

// ------------------- Modules -------------------
const { handleKO, useHearts, useStamina } = require('../modules/characterStatsModule');
const { getGearModLevel } = require('../modules/gearModule');

// ------------------- Utility Functions -------------------
const { generateUniqueId } = require('../utils/uniqueIdUtils');

// ------------------- Configuration Constants -------------------
const BATTLE_PROGRESS_PATH = path.join(__dirname, '..', 'data', 'battleProgress.json');

// ============================================================================
// File Initialization Functions
// ------------------- Ensure Battle Progress File Exists -------------------
function ensureBattleProgressFileExists() {
  if (!fs.existsSync(BATTLE_PROGRESS_PATH)) {
    fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify({}));
  } else {
    try {
      JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));
    } catch (error) {
      handleError(error, 'pvpCombatModule.js');
      fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify({}));
    }
  }
}

// ============================================================================
// Battle Progress Storage Functions
// ------------------- Store Battle Progress -------------------
async function storeBattleProgress(character, monster, tier, monsterHearts, progress) {
  ensureBattleProgressFileExists();
  const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));
  
  const battleId = generateUniqueId('B');
  
  battleProgress[battleId] = {
    battleId,
    characters: [character],
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
    handleError(err, 'pvpCombatModule.js');
    console.error(`[pvpCombatModule.js]: ❌ Error storing battle progress for Battle ID "${battleId}":`, err);
    throw err;
  }
  return battleId;
}

// ------------------- Get Battle Progress by ID -------------------
async function getBattleProgressById(battleId) {
  ensureBattleProgressFileExists();
  const raw = fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8');
  const battleProgress = JSON.parse(raw);

  if (battleProgress[battleId]) {
    return battleProgress[battleId];
  }

  console.error(`[pvpCombatModule.js]: ❌ Error - No battle progress found for Battle ID: ${battleId}`);
  return null;
}

// ------------------- Update Battle Progress -------------------
async function updateBattleProgress(battleId, updatedProgress, outcome) {
  ensureBattleProgressFileExists();
  const battleProgress = await getBattleProgressById(battleId);
  if (!battleProgress) return;

  battleProgress.monsterHearts.current = Math.max(battleProgress.monsterHearts.current - (outcome.hearts || 0), 0);

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
    handleError(err, 'pvpCombatModule.js');
    console.error(`[pvpCombatModule.js]: ❌ Error updating battle progress for Battle ID "${battleId}":`, err);
    throw err;
  }
}

// ------------------- Delete Battle Progress -------------------
async function deleteBattleProgressById(battleId) {
  ensureBattleProgressFileExists();
  try {
    const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));
    if (battleProgress[battleId]) {
      delete battleProgress[battleId];
      fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));
    }
  } catch (error) {
    handleError(error, 'pvpCombatModule.js');
    console.error(`[pvpCombatModule.js]: ❌ Error deleting battle progress for Battle ID "${battleId}":`, error);
  }
}

// ------------------- Update Monster Hearts to Zero -------------------
async function updateMonsterHeartsToZero(battleId) {
  ensureBattleProgressFileExists();
  const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));
  if (battleProgress[battleId]) {
    battleProgress[battleId].monsterHearts.current = 0;
    try {
      fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));
    } catch (err) {
      handleError(err, 'pvpCombatModule.js');
      console.error(`[pvpCombatModule.js]: ❌ Error updating monster hearts for Battle ID "${battleId}":`, err);
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
    console.log(`[pvpCombatModule.js]: debug - ${character.name} has no gearArmor defined, defaulting armor defense to 0.`);
  } else {
    ['head', 'chest', 'legs'].forEach(slot => {
      const gearPiece = character.gearArmor[slot];
      if (gearPiece) {
        const modValue = getGearModLevel(gearPiece);
        if (modValue === 0) {
          console.log(`[pvpCombatModule.js]: debug - ${character.name} gear in slot ${slot} returned mod value 0.`);
        }
        total += modValue;
      } else {
        console.log(`[pvpCombatModule.js]: debug - ${character.name} has no gear for slot ${slot}, defaulting to 0.`);
      }
    });
  }
  
  if (!character.gearShield) {
    console.log(`[pvpCombatModule.js]: debug - ${character.name} has no gearShield defined, defaulting shield defense to 0.`);
  } else {
    const shieldMod = getGearModLevel(character.gearShield);
    if (shieldMod === 0) {
      console.log(`[pvpCombatModule.js]: debug - ${character.name}'s shield returned mod value 0.`);
    }
    total += shieldMod;
  }
  
  return total;
}

// ------------------- Get Weapon Mod -------------------
function getWeaponMod(character) {
  if (!character.gearWeapon) {
    console.log(`[pvpCombatModule.js]: debug - ${character.name} has no gearWeapon defined, defaulting weapon mod to 0.`);
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

// ------------------- Start PVP Battle -------------------
async function startPvPBattle(attacker, defender) {
  const battleId = await storeBattleProgress(attacker, defender, 0, { current: defender.currentHearts }, 'PVP Battle initiated');
  return battleId;
}

// ------------------- Take PVP Turn -------------------
async function takePvPTurn(battleId, attacker, defender) {
  const battleProgress = await getBattleProgressById(battleId);
  if (!battleProgress) return null;

  const weaponMod = getWeaponMod(attacker);
  const { total: rollTotal, rolls } = rollWeaponDice(weaponMod);
  const defense = getTotalDefense(defender);

  const outcome = {
    attacker: attacker.name,
    defender: defender.name,
    rollTotal,
    rolls,
    defense,
    success: rollTotal > defense,
    hearts: rollTotal > defense ? 1 : 0,
    character: defender
  };

  await updateBattleProgress(battleId, 
    `${attacker.name} rolled ${rollTotal} (${rolls.join(', ')}) against ${defender.name}'s defense of ${defense}. ` +
    `${outcome.success ? 'Hit!' : 'Miss!'}`, 
    outcome
  );

  return outcome;
}

// ------------------- Update Battle Progress Hearts -------------------
async function updateBattleProgressHearts(battleId, newMonsterHeartsCurrent) {
  ensureBattleProgressFileExists();
  const battleProgress = JSON.parse(fs.readFileSync(BATTLE_PROGRESS_PATH, 'utf8'));
  if (battleProgress[battleId]) {
    battleProgress[battleId].monsterHearts.current = newMonsterHeartsCurrent;
    try {
      fs.writeFileSync(BATTLE_PROGRESS_PATH, JSON.stringify(battleProgress, null, 2));
    } catch (err) {
      handleError(err, 'pvpCombatModule.js');
      console.error(`[pvpCombatModule.js]: ❌ Error updating monster hearts for Battle ID "${battleId}":`, err);
      throw err;
    }
  }
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
  startPvPBattle,
  takePvPTurn,
  updateBattleProgressHearts
}; 