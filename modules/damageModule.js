// ------------------- Import necessary modules -------------------
// Standard library imports
const { handleKO, useHearts } = require('../modules/characterStatsModule');  // Functions to handle KO and heart usage

// Local module imports
const { getBattleProgressById, storeBattleProgress, updateBattleProgress } = require('../modules/combatModule');  // Manage battle progress
const Monster = require('../models/MonsterModel');  // Model for monster-related data

// Import buff calculation functions from buffModule
const { calculateAttackBuff, calculateDefenseBuff, applyBuffs } = require('../modules/buffModule');

// Import high-tier encounter outcomes
const {
  getTier5EncounterOutcome,
  getTier6EncounterOutcome,
  getTier7EncounterOutcome,
  getTier8EncounterOutcome,
  getTier9EncounterOutcome,
  getTier10EncounterOutcome,  // Tier 10 encounter outcome
} = require('../modules/highTierMonsterModule');

// ------------------- Calculate encounter outcome -------------------
// Determines the outcome of the battle based on character stats, monster stats, buffs, and dice rolls.
// This logic is limited to tiers 1–4. KO is no longer possible for these tiers.
const getEncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {
  try {
    const tier = monster.tier; // Monster's tier determines damage and outcome
    let outcome;

    // ------------------- Outcome calculation based on adjustedRandomValue and tier -------------------
    if (adjustedRandomValue <= 25) {
      // High damage range
      outcome = {
        result: `${tier} HEART(S)`, // Tiers 1-4 directly correlate to damage hearts
        hearts: tier,
        canLoot: false,
      };
    } else if (adjustedRandomValue <= 50) {
      // Medium damage or loot
      outcome =
        tier === 1
          ? { result: 'Win!/Loot', canLoot: true, hearts: 0 }
          : { result: `${tier - 1} HEART(S)`, hearts: tier - 1, canLoot: false };
    } else if (adjustedRandomValue <= 75) {
      // Low damage or loot
      outcome =
        tier <= 2
          ? { result: 'Win!/Loot', canLoot: true, hearts: 0 }
          : { result: `${tier - 2} HEART(S)`, hearts: tier - 2, canLoot: false };
    } else if (adjustedRandomValue <= 89) {
      // Mostly loot for lower tiers
      outcome = {
        result: 'Win!/Loot',
        canLoot: true,
        hearts: 0,
      };
    } else {
      // Guaranteed loot
      outcome = { result: 'Win!/Loot', canLoot: true, hearts: 0 };
    }

    // ------------------- Handle heart usage -------------------
    if (outcome.hearts > 0) {
      await useHearts(character._id, outcome.hearts); // Deduct hearts from the character
    }

    // ------------------- Return complete encounter outcome -------------------
    return {
      ...outcome,
      damageValue,
      adjustedRandomValue,
      attackSuccess,
      defenseSuccess,
    };
  } catch (error) {
    console.error('[DAMAGE ERROR] Encounter Outcome Calculation Failed:', error);
    throw error;
  }
};

// ------------------- Process Battle Logic -------------------
// Manages the battle logic by calculating buffs, updating battle progress, and determining the outcome.
async function processBattle(character, monster, battleId, originalRoll, interaction) {
  // Fetch the current battle progress
  const battleProgress = await getBattleProgressById(battleId);
  if (!battleProgress) {
    console.error('Error: Battle progress not found for battleId:', battleId);
    return null;
  }

  try {
    // Calculate attack and defense buffs
    const attackSuccess = calculateAttackBuff(character); // Calculate attack buff
    const defenseSuccess = calculateDefenseBuff(character); // Calculate defense buff
    const adjustedRandomValue = applyBuffs(
      originalRoll,
      attackSuccess,
      defenseSuccess,
      character.attack,
      character.defense
    );

    // Determine the outcome based on the monster's tier
    let outcome;
    if (monster.tier <= 4) {
      // Use existing encounter outcome logic for tiers 1–4
      outcome = await getEncounterOutcome(character, monster, character.attack, adjustedRandomValue, attackSuccess, defenseSuccess);
    } else {
      // Use specific high-tier encounter logic for tiers 5–10
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
            console.log('[DAMAGE DEBUG] KO Detected. Handling...');
            await handleKO(character._id); // Handle character knockout for Tier 10
          }
          break;
        default:
          throw new Error(`Unsupported monster tier: ${monster.tier}`);
      }
    }

    if (!outcome) {
      console.error('Error: Failed to calculate encounter outcome.');
      return null;
    }

    // Update battle progress
    battleProgress.monsterHearts.current = Math.max(0, battleProgress.monsterHearts.current - outcome.hearts);
    await storeBattleProgress(battleId, character, monster, monster.tier, battleProgress.monsterHearts, outcome.result);

    return { ...outcome, originalRoll, adjustedRandomValue, attackSuccess, defenseSuccess };
  } catch (error) {
    console.error('Error during battle processing:', error); // Log any errors during processing
    return null; // Return null if any error occurs
  }
}

// ------------------- Exported Functions -------------------
// Exports the main battle processing and encounter outcome functions for external use
module.exports = {
  getEncounterOutcome,
  processBattle
};
