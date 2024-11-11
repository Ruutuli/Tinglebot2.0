// ------------------- Import necessary modules -------------------
// Standard library imports
const { handleKO, useHearts } = require('../modules/characterStatsModule');  // Functions to handle KO and heart usage

// Local module imports
const { getBattleProgressById, storeBattleProgress, updateBattleProgress } = require('../modules/combatModule');  // Manage battle progress
const Monster = require('../models/MonsterModel');  // Model for monster-related data

// Import buff calculation functions from buffModule
const { calculateAttackBuff, calculateDefenseBuff, applyBuffs } = require('../modules/buffModule');

// Import character-related services
const { fetchCharacterByNameAndUserId } = require('../database/characterService');  // Import this to avoid "undefined" error

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
const getEncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {
  try {
    const tier = monster.tier;
    let outcome;

    // Determine the outcome based on adjusted random value and monster tier
    if (adjustedRandomValue <= 25) {
      outcome = tier === 1 ? { result: '1 HEART', hearts: 1, canLoot: false }
              : tier === 2 ? { result: '2 HEARTS', hearts: 2, canLoot: false }
              : { result: 'KO', hearts: character.currentHearts, canLoot: false };
    } else if (adjustedRandomValue <= 50) {
      outcome = tier === 1 ? { result: 'Win!/Loot', canLoot: true, hearts: 0 }
              : tier === 2 ? { result: '1 HEART', hearts: 1, canLoot: false }
              : tier === 3 ? { result: '2 HEARTS', hearts: 2, canLoot: false }
              : { result: '3 HEARTS', hearts: 3, canLoot: false };
    } else if (adjustedRandomValue <= 75) {
      outcome = (tier === 1 || tier === 2) ? { result: 'Win!/Loot', canLoot: true, hearts: 0 }
              : tier === 3 ? { result: '1 HEART', hearts: 1, canLoot: false }
              : { result: '2 HEARTS', hearts: 2, canLoot: false };
    } else if (adjustedRandomValue <= 89) {
      outcome = (tier <= 3) ? { result: 'Win!/Loot', canLoot: true, hearts: 0 }
              : { result: '1 HEART', hearts: 1, canLoot: false };
    } else {
      outcome = { result: 'Win!/Loot', canLoot: true, hearts: 0 };
    }

    // Apply hearts reduction and KO handling if applicable
    if (outcome.hearts) {
      await useHearts(character._id, outcome.hearts);  // Deduct hearts from character
      if (outcome.result === 'KO') {
        await handleKO(character._id);  // Handle KO if necessary
      }
    }

    return { ...outcome, attackSuccess, defenseSuccess, damageValue, adjustedRandomValue };
  } catch (error) {
    console.error('Error in getEncounterOutcome:', error);  // Log error
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
    const attackSuccess = calculateAttackBuff(character);  // Calculate attack buff
    const defenseSuccess = calculateDefenseBuff(character);  // Calculate defense buff
    const adjustedRandomValue = applyBuffs(originalRoll, attackSuccess, defenseSuccess, character.attack, character.defense);

    // Determine the outcome based on the monster's tier
    let outcome;
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
        break;
      default:
        throw new Error(`Unsupported monster tier: ${monster.tier}`);
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
    console.error('Error during battle processing:', error);  // Log any errors during processing
    return null;  // Return null if any error occurs
  }
}

// ------------------- Exported Functions -------------------
// Exports the main battle processing and encounter outcome functions for external use
module.exports = {
  getEncounterOutcome,
  processBattle
};
