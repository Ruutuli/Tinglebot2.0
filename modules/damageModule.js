// ------------------- damageModule.js -------------------
// This module calculates battle encounter outcomes and processes damage during combat.
// It uses character and monster stats, buff calculations, and high-tier encounter logic
// to determine damage, heart deductions, and loot outcomes, then updates battle progress.


// ============================================================================
// Standard Libraries
// ------------------- Import Node.js core modules -------------------
// (No standard library imports in this file)


// ============================================================================
// Local Modules & Database Models
// ------------------- Import local modules and models -------------------
const { handleKO, useHearts } = require('../modules/characterStatsModule');  // Functions to handle KO and heart usage
const { getBattleProgressById, storeBattleProgress } = require('../modules/raidCombatModule');  // Manage battle progress
//this import needs to be fixed to the correct path
const Monster = require('../models/MonsterModel');  // Model for monster-related data

// ============================================================================
// Utility Modules
// ------------------- Import buff calculation functions -------------------
const { calculateAttackBuff, calculateDefenseBuff, applyBuffs } = require('../modules/buffModule');

const { handleError } = require('../utils/globalErrorHandler');
// ------------------- Import high-tier encounter outcome functions -------------------
const {
  getTier5EncounterOutcome,
  getTier6EncounterOutcome,
  getTier7EncounterOutcome,
  getTier8EncounterOutcome,
  getTier9EncounterOutcome,
  getTier10EncounterOutcome  // Tier 10 encounter outcome
} = require('../modules/highTierMonsterModule');


// ============================================================================
// Encounter Outcome Calculation Function
// ------------------- Calculate Encounter Outcome -------------------
// Determines the outcome of the battle based on character stats, monster stats, buffs, and dice rolls.
// This logic is used for monsters with tier 1–4; KO is not possible within these tiers.
const getEncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {
  try {
    const tier = monster.tier; // Monster's tier determines damage and outcome
    let outcome;

    // ------------------- Outcome Calculation Based on Adjusted Random Value -------------------
    if (adjustedRandomValue <= 25) {
      // High damage range: Outcome equals monster tier in hearts.
      outcome = {
        result: `${tier} HEART(S)`,
        hearts: tier,
        canLoot: false,
      };
    } else if (adjustedRandomValue <= 50) {
      // Medium damage or loot outcome.
      outcome = tier === 1
        ? { result: 'Win!/Loot', canLoot: true, hearts: 0 }
        : { result: `${tier - 1} HEART(S)`, hearts: tier - 1, canLoot: false };
    } else if (adjustedRandomValue <= 75) {
      // Low damage or loot outcome.
      outcome = tier <= 2
        ? { result: 'Win!/Loot', canLoot: true, hearts: 0 }
        : { result: `${tier - 2} HEART(S)`, hearts: tier - 2, canLoot: false };
    } else if (adjustedRandomValue <= 89) {
      // Outcome primarily favors loot.
      outcome = { result: 'Win!/Loot', canLoot: true, hearts: 0 };
    } else {
      // Guaranteed loot outcome.
      outcome = { result: 'Win!/Loot', canLoot: true, hearts: 0 };
    }

    // ------------------- Deduct Hearts if Required -------------------
    if (outcome.hearts > 0) {
      await useHearts(character._id, outcome.hearts);
    }

    // ------------------- Return Complete Outcome -------------------
    return {
      ...outcome,
      damageValue,
      adjustedRandomValue,
      attackSuccess,
      defenseSuccess,
    };
  } catch (error) {
    handleError(error, 'damageModule.js');

    console.error('[damageModule.js]: logs Encounter Outcome Calculation Failed:', error);
    throw error;
  }
};


// ============================================================================
// Battle Processing Function
// ------------------- Process Battle -------------------
// Manages the battle logic by calculating buffs, updating battle progress,
// and determining the encounter outcome based on monster tier.
async function processBattle(character, monster, battleId, originalRoll, interaction) {
  // ------------------- Retrieve Battle Progress -------------------
  const battleProgress = await getBattleProgressById(battleId);
  if (!battleProgress) {
      console.error(`[damageModule.js]: logs Error: No battle progress found for Battle ID: ${battleId}`);
      await interaction.editReply('❌ **An error occurred during the battle: Battle progress not found.**');
      return;
  }
  
  try {
    // ------------------- Calculate Buffs -------------------
    const attackSuccess = calculateAttackBuff(character);  // Calculate attack buff
    const defenseSuccess = calculateDefenseBuff(character);  // Calculate defense buff
    const adjustedRandomValue = applyBuffs(
      originalRoll,
      attackSuccess,
      defenseSuccess,
      character.attack,
      character.defense
    );

    // ------------------- Determine Encounter Outcome -------------------
    let outcome;
    if (monster.tier <= 4) {
      // Use encounter outcome logic for tiers 1–4.
      outcome = await getEncounterOutcome(character, monster, character.attack, adjustedRandomValue, attackSuccess, defenseSuccess);
    } else {
      // Use high-tier encounter outcome logic for tiers 5–10.
      switch (monster.tier) {
        case 5:
          outcome = await getTier5EncounterOutcome(character, monster, character.attack, adjustedRandomValue, attackSuccess, defenseSuccess);
          break;
        case 6:
          outcome = await getTier6EncounterOutcome(character, monster, character.attack, adjustedRandomValue, attackSuccess, defenseSuccess);
          break;
        case 7:
          outcome = await getTier7EncounterOutcome(character, monster, character.attack, adjustedRandomValue, attackSuccess, defenseSuccess);
          break;
        case 8:
          outcome = await getTier8EncounterOutcome(character, monster, character.attack, adjustedRandomValue, attackSuccess, defenseSuccess);
          break;
        case 9:
          outcome = await getTier9EncounterOutcome(character, monster, character.attack, adjustedRandomValue, attackSuccess, defenseSuccess);
          break;
        case 10:
          outcome = await getTier10EncounterOutcome(character, monster, character.attack, adjustedRandomValue, attackSuccess, defenseSuccess);
          if (outcome.result === 'KO') {
            console.log('[damageModule.js]: logs KO Detected. Handling...');
            await handleKO(character._id); // Handle character knockout for Tier 10
          }
          break;
        default:
          throw new Error(`Unsupported monster tier: ${monster.tier}`);
      }
    }

    if (!outcome) {
      console.error('[damageModule.js]: logs Error: Failed to calculate encounter outcome.');
      return null;
    }

    // ------------------- Update Battle Progress -------------------
    battleProgress.monsterHearts.current = Math.max(0, battleProgress.monsterHearts.current - outcome.hearts);
    await storeBattleProgress(battleId, character, monster, monster.tier, battleProgress.monsterHearts, outcome.result);

    return { ...outcome, originalRoll, adjustedRandomValue, attackSuccess, defenseSuccess };
  } catch (error) {
    handleError(error, 'damageModule.js');

    console.error('[damageModule.js]: logs Error during battle processing:', error);
    return null;
  }
}


// ============================================================================
// Module Exports
// ------------------- Exporting functions -------------------
module.exports = {
  getEncounterOutcome,
  processBattle
};
