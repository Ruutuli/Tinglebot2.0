// ============================================================================
// ---- Encounter Module ----
// Handles all encounter-related logic including damage calculation, battle processing,
// and high-tier monster encounters. Combines functionality from damageModule.js and
// highTierMonsterModule.js into a single, organized module.
// ============================================================================

// ============================================================================
// Standard Libraries
// ============================================================================
// (No standard library imports needed)

// ============================================================================
// Local Modules & Database Models
// ============================================================================
const logger = require('@/utils/logger');
const { handleKO, useHearts } = require('./characterStatsModule');

// ------------------- Helper Function for Context -------------------
// Creates context object for error handling in encounter functions
const createEncounterContext = (character, operation) => ({
    commandName: 'loot',
    characterName: character.name,
    userId: character.userId,
    operation: operation
});
const Monster = require('@/models/MonsterModel');
const { calculateAttackBuff, calculateDefenseBuff, applyBuffs, getDamageResistance } = require('./buffModule');
const { handleError } = require('@/utils/globalErrorHandler');
const { retrieveFromStorage, saveToStorage } = require('@/utils/storage');

// ============================================================================
// Utility Functions
// ============================================================================

// ------------------- Battle Logging Function -------------------
function logBattleDetails(tier, characterName, monsterName, roll, damage, monsterDamage) {
    // Battle logging removed for cleaner output
}

// ------------------- Calculate Damage Function -------------------
// Calculates damage with resistance considerations for elemental enemies
function calculateDamage(attacker, defender) {
    try {
        let baseDamage = 1; // Base damage is 1 heart
        
        // Check if this is a monster attacking a character (for resistance calculation)
        if (defender.buff && defender.buff.active) {
            const { getActiveBuffEffects } = require('./elixirModule');
            const buffEffects = getActiveBuffEffects(defender);
            
            // Helper function to check monster element (supports both element field and name-based detection)
            const hasElement = (monster, elementType) => {
                // First check the element field on the monster
                if (monster.element === elementType) return true;
                
                // Fallback to name-based detection for backwards compatibility
                switch (elementType) {
                    case 'electric':
                        return monster.name && (monster.name.includes('Electric') || monster.name.includes('Thunder'));
                    case 'fire':
                        return monster.name && (monster.name.includes('Fire') || monster.name.includes('Igneo') || monster.name.includes('Meteo'));
                    case 'ice':
                        return monster.name && (monster.name.includes('Ice') || monster.name.includes('Frost') || monster.name.includes('Blizzard') || monster.name.includes('Snow'));
                    case 'water':
                        return monster.name && monster.name.includes('Water');
                    case 'earth':
                        return monster.name && (monster.name.includes('Stone') || monster.name.includes('Rock'));
                    case 'undead':
                        return monster.name && (monster.name.includes('Cursed') || monster.name.includes('Stal') || monster.name.includes('Gloom') || monster.name.includes('Gibdo'));
                    case 'wind':
                        return monster.name && (monster.name.includes('Sky') || monster.name.includes('Forest'));
                    default:
                        return false;
                }
            };
            
            // Check if monster is electric type and character has electric resistance
            if (hasElement(attacker, 'electric') && buffEffects && buffEffects.electricResistance > 0) {
                // Electric resistance reduces damage by 50% per level
                const resistanceReduction = buffEffects.electricResistance * 0.5;
                baseDamage = Math.max(0, baseDamage - resistanceReduction);
                console.log(`[encounterModule.js]: ⚡ Electric resistance: damage reduced to ${baseDamage} hearts`);
                
                // Consume electro elixir after use
                const { shouldConsumeElixir, consumeElixirBuff } = require('./elixirModule');
                if (shouldConsumeElixir(defender, 'combat', { monster: attacker })) {
                    consumeElixirBuff(defender);
                } else if (defender.buff?.active) {
                    console.log(`[encounterModule.js]: 🧪 Elixir not used for ${defender.name} - conditions not met. Active buff: ${defender.buff.type}`);
                }
            }
            
            // Check if monster is fire type and character has fire resistance
            if (hasElement(attacker, 'fire') && buffEffects && buffEffects.fireResistance > 0) {
                // Fire resistance reduces damage by 50% per level
                const resistanceReduction = buffEffects.fireResistance * 0.5;
                baseDamage = Math.max(0, baseDamage - resistanceReduction);
                console.log(`[encounterModule.js]: 🔥 Fire resistance: damage reduced to ${baseDamage} hearts`);
                
                // Consume fireproof elixir after use
                const { shouldConsumeElixir, consumeElixirBuff } = require('./elixirModule');
                if (shouldConsumeElixir(defender, 'combat', { monster: attacker })) {
                    consumeElixirBuff(defender);
                } else if (defender.buff?.active) {
                    console.log(`[encounterModule.js]: 🧪 Elixir not used for ${defender.name} - conditions not met. Active buff: ${defender.buff.type}`);
                }
            }
            
            // Check if monster is ice type and character has cold resistance (Spicy Elixir)
            if (hasElement(attacker, 'ice') && buffEffects && buffEffects.coldResistance > 0) {
                // Cold resistance reduces damage by 50% per level
                const resistanceReduction = buffEffects.coldResistance * 0.5;
                baseDamage = Math.max(0, baseDamage - resistanceReduction);
                console.log(`[encounterModule.js]: ❄️ Cold resistance: damage reduced to ${baseDamage} hearts`);
                
                // Consume spicy elixir after use
                const { shouldConsumeElixir, consumeElixirBuff } = require('./elixirModule');
                if (shouldConsumeElixir(defender, 'combat', { monster: attacker })) {
                    consumeElixirBuff(defender);
                } else if (defender.buff?.active) {
                    console.log(`[encounterModule.js]: 🧪 Elixir not used for ${defender.name} - conditions not met. Active buff: ${defender.buff.type}`);
                }
            }
            
            // Check if monster is water type and character has water resistance (Chilly Elixir)
            if (hasElement(attacker, 'water') && buffEffects && buffEffects.waterResistance > 0) {
                // Water resistance reduces damage by 50% per level
                const resistanceReduction = buffEffects.waterResistance * 0.5;
                baseDamage = Math.max(0, baseDamage - resistanceReduction);
                console.log(`[encounterModule.js]: 💧 Water resistance: damage reduced to ${baseDamage} hearts`);
                
                // Consume chilly elixir after use
                const { shouldConsumeElixir, consumeElixirBuff } = require('./elixirModule');
                if (shouldConsumeElixir(defender, 'combat', { monster: attacker })) {
                    consumeElixirBuff(defender);
                } else if (defender.buff?.active) {
                    console.log(`[encounterModule.js]: 🧪 Elixir not used for ${defender.name} - conditions not met. Active buff: ${defender.buff.type}`);
                }
            }
        }
        
        return Math.max(0, baseDamage); // Ensure damage is never negative
    } catch (error) {
        console.error(`[encounterModule.js]: ❌ Error in calculateDamage:`, error);
        return 1; // Fallback to base damage
    }
}

// ============================================================================
// Low Tier Encounter Logic (Tiers 1-4)
// ============================================================================

// ---- Function: getEncounterOutcome ----
// Determines the outcome of battles for tiers 1-4
// options: { skipPersist } - when true, do not call useHearts (for exploration testing mode)
const getEncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, options = {}) => {
    try {
        const tier = monster.tier;
        let outcome;

        // --- SPECIAL RULE: Aemu and the Dragons always win and 1HKO ---
        if (character.name === 'Aemu' || character.modTitle === 'Dragon') {
            console.log(`[encounterModule.js]: 👑 ${character.name} (${character.modTitle || 'Oracle'}) uses 1HKO ability!`);
            
            // Import flavor text module for mod character victory messages
            const { generateModCharacterVictoryMessage } = require('./flavorTextModule');
            
            // Generate appropriate flavor text based on character type
            const modFlavorText = generateModCharacterVictoryMessage(
                character.name, 
                character.modTitle || 'Oracle', 
                character.modType || 'Power'
            );
            
            outcome = {
                result: modFlavorText, // Use special mod character flavor text
                hearts: 0,
                canLoot: true,
            };
            
            return {
                ...outcome,
                damageValue,
                adjustedRandomValue,
                attackSuccess,
                defenseSuccess,
            };
        }

        // --- FIX: If defenseSuccess, always block all damage and win ---
        if (defenseSuccess) {
            outcome = {
                result: 'Win!/Loot',
                hearts: 0,
                canLoot: true,
            };
            logger.info('EXPLORE', `encounter T${tier} adj=${adjustedRandomValue} def✓ → win loot`);
        } else if (adjustedRandomValue <= 25) {
            outcome = {
                result: `${tier} HEART(S)`,
                hearts: tier,
                canLoot: false,
            };
            logger.info('EXPLORE', `encounter T${tier} adj=${adjustedRandomValue} → ${tier}❤`);
        } else if (adjustedRandomValue <= 50) {
            outcome = tier === 1
                ? { result: 'Win!/Loot', canLoot: true, hearts: 0 }
                : { result: `${tier - 1} HEART(S)`, hearts: tier - 1, canLoot: false };
            logger.info('EXPLORE', `encounter T${tier} adj=${adjustedRandomValue} → ${outcome.hearts ?? 0}❤`);
        } else if (adjustedRandomValue <= 75) {
            outcome = tier <= 2
                ? { result: 'Win!/Loot', canLoot: true, hearts: 0 }
                : { result: `${tier - 2} HEART(S)`, hearts: tier - 2, canLoot: false };
            logger.info('EXPLORE', `encounter T${tier} adj=${adjustedRandomValue} → ${outcome.hearts ?? 0}❤`);
        } else if (adjustedRandomValue <= 89) {
            outcome = { result: 'Win!/Loot', canLoot: true, hearts: 0 };
            logger.info('EXPLORE', `encounter T${tier} adj=${adjustedRandomValue} → win loot`);
        } else {
            outcome = { result: 'Win!/Loot', canLoot: true, hearts: 0 };
            logger.info('EXPLORE', `encounter T${tier} adj=${adjustedRandomValue} → win loot`);
        }

        if (outcome.hearts > 0 && !options.skipPersist) {
            logger.info('LOOT', `${character.name} loses ${outcome.hearts} hearts`);
            await useHearts(character._id, outcome.hearts, createEncounterContext(character, 'encounter_heart_loss'));
        }

        return {
            ...outcome,
            damageValue,
            adjustedRandomValue,
            attackSuccess,
            defenseSuccess,
        };
    } catch (error) {
        handleError(error, 'encounterModule.js');
        console.error('[encounterModule.js]: Encounter Outcome Calculation Failed:', error);
        throw error;
    }
};

// ============================================================================
// High Tier Encounter Logic (Tiers 5-10)
// ============================================================================

// ---- Function: getTier5EncounterOutcome ----
// Handles tier 5 monster encounters
const getTier5EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, isRaidContext = false) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    // --- SPECIAL RULE: Aemu and the Dragons always win and 1HKO ---
    if (character.name === 'Aemu' || character.modTitle === 'Dragon') {
        console.log(`[encounterModule.js]: 👑 ${character.name} (${character.modTitle || 'Oracle'}) uses 1HKO ability!`);
        
        // Import flavor text module for mod character victory messages
        const { generateModCharacterVictoryMessage } = require('./flavorTextModule');
        
        // Generate appropriate flavor text based on character type
        const modFlavorText = generateModCharacterVictoryMessage(
            character.name, 
            character.modTitle || 'Oracle', 
            character.modType || 'Power'
        );
        
        outcome = modFlavorText; // Use special mod character flavor text
        heartsLostForMonster = monster.currentHearts || 3; // 1HKO - take all monster hearts
        
        return { 
            result: outcome, 
            hearts: heartsLostForMonster, 
            playerHearts: {
                current: character.currentHearts,
                max: character.maxHearts
            },
            monsterHearts: {
                current: 0, // Monster is instantly defeated
                max: monster.currentHearts || monster.maxHearts || 3
            },
            adjustedRandomValue, 
            attackSuccess, 
            defenseSuccess,
            canLoot: true
        };
    }

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️ 5 hearts!`;
        characterDamage = 5; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️ 3 hearts!`;
        characterDamage = 3; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️ 2 hearts!`;
        characterDamage = 2; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 54) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 63) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫`;
        characterDamage = 0; // Fixed: No damage when dodging
    } else if (adjustedRandomValue <= 72) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨\n⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
        characterDamage = 0; // Fixed: No damage when dodging
    } else if (adjustedRandomValue <= 81) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
        characterDamage = 0; // Fixed: No damage when attacking
    } else if (adjustedRandomValue <= 90) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙2 hearts!`;
        heartsLostForMonster = 2;
        characterDamage = 0; // Fixed: No damage when attacking
    } else {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙💙3 hearts!`;
        heartsLostForMonster = 3;
        characterDamage = 0; // Fixed: No damage when attacking
    }

    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        // Only handle KO in non-raid contexts to avoid conflicts
        if (!isRaidContext) {
            await handleKO(character._id, createEncounterContext(character, 'tier5_encounter_ko'));
        }
    } else {
        character.currentHearts -= characterDamage;
        // Only use hearts in non-raid contexts to avoid conflicts
        if (!isRaidContext) {
            await useHearts(character._id, characterDamage, createEncounterContext(character, 'tier5_encounter_damage'));
        }
    }

    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { 
        result: outcome, 
        hearts: heartsLostForMonster, 
        playerHearts: {
            current: character.currentHearts,
            max: character.maxHearts
        },
        monsterHearts: {
            current: monster.currentHearts,
            max: monster.maxHearts
        },
        adjustedRandomValue, 
        attackSuccess, 
        defenseSuccess 
    };
};

// ---- Function: getTier6EncounterOutcome ----
// Handles tier 6 monster encounters
const getTier6EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, isRaidContext = false) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    // --- SPECIAL RULE: Aemu and the Dragons always win and 1HKO ---
    if (character.name === 'Aemu' || character.modTitle === 'Dragon') {
        console.log(`[encounterModule.js]: 👑 ${character.name} (${character.modTitle || 'Oracle'}) uses 1HKO ability!`);
        
        // Import flavor text module for mod character victory messages
        const { generateModCharacterVictoryMessage } = require('./flavorTextModule');
        
        // Generate appropriate flavor text based on character type
        const modFlavorText = generateModCharacterVictoryMessage(
            character.name, 
            character.modTitle || 'Oracle', 
            character.modType || 'Power'
        );
        
        outcome = modFlavorText; // Use special mod character flavor text
        heartsLostForMonster = monster.currentHearts || 4; // 1HKO - take all monster hearts
        
        return { 
            result: outcome, 
            hearts: heartsLostForMonster, 
            playerHearts: {
                current: character.currentHearts,
                max: character.maxHearts
            },
            monsterHearts: {
                current: 0, // Monster is instantly defeated
                max: monster.currentHearts || monster.maxHearts || 4
            },
            adjustedRandomValue, 
            attackSuccess, 
            defenseSuccess,
            canLoot: true
        };
    }

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️ 6 hearts!`;
        characterDamage = 6; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️ 4 hearts!`;
        characterDamage = 4; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️ 3 hearts!`;
        characterDamage = 3; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️ 2 hearts!`;
        characterDamage = 2; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 54) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 63) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 72) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨\n⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
        characterDamage = 0; // Fixed: No damage when dodging
    } else if (adjustedRandomValue <= 81) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
        characterDamage = 0; // Fixed: No damage when attacking
    } else if (adjustedRandomValue <= 90) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙2 hearts!`;
        heartsLostForMonster = 2;
        characterDamage = 0; // Fixed: No damage when attacking
    } else {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙💙3 hearts!`;
        heartsLostForMonster = 3;
        characterDamage = 0; // Fixed: No damage when attacking
    }

    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        // Only handle KO in non-raid contexts to avoid conflicts
        if (!isRaidContext) {
            await handleKO(character._id, createEncounterContext(character, 'tier5_encounter_ko'));
        }
    } else {
        character.currentHearts -= characterDamage;
        // Only use hearts in non-raid contexts to avoid conflicts
        if (!isRaidContext) {
            await useHearts(character._id, characterDamage, createEncounterContext(character, 'tier5_encounter_damage'));
        }
    }

    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { 
        result: outcome, 
        hearts: heartsLostForMonster, 
        playerHearts: {
            current: character.currentHearts,
            max: character.maxHearts
        },
        monsterHearts: {
            current: monster.currentHearts,
            max: monster.maxHearts
        },
        adjustedRandomValue, 
        attackSuccess, 
        defenseSuccess 
    };
};

// ---- Function: getTier7EncounterOutcome ----
// Handles tier 7 monster encounters
const getTier7EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, isRaidContext = false) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    // --- SPECIAL RULE: Aemu and the Dragons always win and 1HKO ---
    if (character.name === 'Aemu' || character.modTitle === 'Dragon') {
        console.log(`[encounterModule.js]: 👑 ${character.name} (${character.modTitle || 'Oracle'}) uses 1HKO ability!`);
        
        // Import flavor text module for mod character victory messages
        const { generateModCharacterVictoryMessage } = require('./flavorTextModule');
        
        // Generate appropriate flavor text based on character type
        const modFlavorText = generateModCharacterVictoryMessage(
            character.name, 
            character.modTitle || 'Oracle', 
            character.modType || 'Power'
        );
        
        outcome = modFlavorText; // Use special mod character flavor text
        heartsLostForMonster = monster.currentHearts || 5; // 1HKO - take all monster hearts
        
        return { 
            result: outcome, 
            hearts: heartsLostForMonster, 
            playerHearts: {
                current: character.currentHearts,
                max: character.maxHearts
            },
            monsterHearts: {
                current: 0, // Monster is instantly defeated
                max: monster.currentHearts || monster.maxHearts || 5
            },
            adjustedRandomValue, 
            attackSuccess, 
            defenseSuccess,
            canLoot: true
        };
    }

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️ 7 hearts!`;
        characterDamage = 7; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️ 5 hearts!`;
        characterDamage = 5; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️ 4 hearts!`;
        characterDamage = 4; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️ 3 hearts!`;
        characterDamage = 3; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 45) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️ 2 hearts!`;
        characterDamage = 2; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 54) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 63) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 72) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨\n⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
        characterDamage = 0; // Fixed: No damage when dodging
    } else if (adjustedRandomValue <= 81) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
        characterDamage = 0; // Fixed: No damage when attacking
    } else if (adjustedRandomValue <= 90) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙2 hearts!`;
        heartsLostForMonster = 2;
        characterDamage = 0; // Fixed: No damage when attacking
    } else {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙💙3 hearts!`;
        heartsLostForMonster = 3;
        characterDamage = 0; // Fixed: No damage when attacking
    }

    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        // Only handle KO in non-raid contexts to avoid conflicts
        if (!isRaidContext) {
            await handleKO(character._id, createEncounterContext(character, 'tier7_encounter_ko'));
        }
    } else {
        character.currentHearts -= characterDamage;
        // Only use hearts in non-raid contexts to avoid conflicts
        if (!isRaidContext) {
            await useHearts(character._id, characterDamage, createEncounterContext(character, 'tier7_encounter_damage'));
        }
    }

    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { 
        result: outcome, 
        hearts: heartsLostForMonster, 
        playerHearts: {
            current: character.currentHearts,
            max: character.maxHearts
        },
        monsterHearts: {
            current: monster.currentHearts,
            max: monster.maxHearts
        },
        adjustedRandomValue, 
        attackSuccess, 
        defenseSuccess 
    };
};

// ---- Function: getTier8EncounterOutcome ----
// Handles tier 8 monster encounters
const getTier8EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, isRaidContext = false) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    // --- SPECIAL RULE: Aemu and the Dragons always win and 1HKO ---
    if (character.name === 'Aemu' || character.modTitle === 'Dragon') {
        console.log(`[encounterModule.js]: 👑 ${character.name} (${character.modTitle || 'Oracle'}) uses 1HKO ability!`);
        
        // Import flavor text module for mod character victory messages
        const { generateModCharacterVictoryMessage } = require('./flavorTextModule');
        
        // Generate appropriate flavor text based on character type
        const modFlavorText = generateModCharacterVictoryMessage(
            character.name, 
            character.modTitle || 'Oracle', 
            character.modType || 'Power'
        );
        
        outcome = modFlavorText; // Use special mod character flavor text
        heartsLostForMonster = monster.currentHearts || 6; // 1HKO - take all monster hearts
        
        return { 
            result: outcome, 
            hearts: heartsLostForMonster, 
            playerHearts: {
                current: character.currentHearts,
                max: character.maxHearts
            },
            monsterHearts: {
                current: 0, // Monster is instantly defeated
                max: monster.currentHearts || monster.maxHearts || 6
            },
            adjustedRandomValue, 
            attackSuccess, 
            defenseSuccess,
            canLoot: true
        };
    }

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️❤️ 8 hearts!`;
        characterDamage = 8; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️ 6 hearts!`;
        characterDamage = 6; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️ 5 hearts!`;
        characterDamage = 5; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️ 4 hearts!`;
        characterDamage = 4; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 45) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️ 3 hearts!`;
        characterDamage = 3; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 54) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 63) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 72) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨\n⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
        characterDamage = 0; // Fixed: No damage when dodging
    } else if (adjustedRandomValue <= 81) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
        characterDamage = 0; // Fixed: No damage when attacking
    } else if (adjustedRandomValue <= 90) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙2 hearts!`;
        heartsLostForMonster = 2;
        characterDamage = 0; // Fixed: No damage when attacking
    } else {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙💙3 hearts!`;
        heartsLostForMonster = 3;
        characterDamage = 0; // Fixed: No damage when attacking
    }

    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        // Only handle KO in non-raid contexts to avoid conflicts
        if (!isRaidContext) {
            await handleKO(character._id, createEncounterContext(character, 'tier8_encounter_ko'));
        }
    } else {
        character.currentHearts -= characterDamage;
        // Only use hearts in non-raid contexts to avoid conflicts
        if (!isRaidContext) {
            await useHearts(character._id, characterDamage, createEncounterContext(character, 'tier8_encounter_damage'));
        }
    }

    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { 
        result: outcome, 
        hearts: heartsLostForMonster, 
        playerHearts: {
            current: character.currentHearts,
            max: character.maxHearts
        },
        monsterHearts: {
            current: monster.currentHearts,
            max: monster.maxHearts
        },
        adjustedRandomValue, 
        attackSuccess, 
        defenseSuccess 
    };
};

// ---- Function: getTier9EncounterOutcome ----
// Handles tier 9 monster encounters
const getTier9EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, isRaidContext = false) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    // --- SPECIAL RULE: Aemu and the Dragons always win and 1HKO ---
    if (character.name === 'Aemu' || character.modTitle === 'Dragon') {
        console.log(`[encounterModule.js]: 👑 ${character.name} (${character.modTitle || 'Oracle'}) uses 1HKO ability!`);
        
        // Import flavor text module for mod character victory messages
        const { generateModCharacterVictoryMessage } = require('./flavorTextModule');
        
        // Generate appropriate flavor text based on character type
        const modFlavorText = generateModCharacterVictoryMessage(
            character.name, 
            character.modTitle || 'Oracle', 
            character.modType || 'Power'
        );
        
        outcome = modFlavorText; // Use special mod character flavor text
        heartsLostForMonster = monster.currentHearts || 7; // 1HKO - take all monster hearts
        
        return { 
            result: outcome, 
            hearts: heartsLostForMonster, 
            playerHearts: {
                current: character.currentHearts,
                max: character.maxHearts
            },
            monsterHearts: {
                current: 0, // Monster is instantly defeated
                max: monster.currentHearts || monster.maxHearts || 7
            },
            adjustedRandomValue, 
            attackSuccess, 
            defenseSuccess,
            canLoot: true
        };
    }

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️❤️❤️ 9 hearts!`;
        characterDamage = 9; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️ 7 hearts!`;
        characterDamage = 7; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️ 6 hearts!`;
        characterDamage = 6; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️ 5 hearts!`;
        characterDamage = 5; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 45) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️ 4 hearts!`;
        characterDamage = 4; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 54) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 63) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 72) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨\n⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
        characterDamage = 0; // Fixed: No damage when dodging
    } else if (adjustedRandomValue <= 81) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
        characterDamage = 0; // Fixed: No damage when attacking
    } else if (adjustedRandomValue <= 90) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙2 hearts!`;
        heartsLostForMonster = 2;
        characterDamage = 0; // Fixed: No damage when attacking
    } else {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙💙3 hearts!`;
        heartsLostForMonster = 3;
        characterDamage = 0; // Fixed: No damage when attacking
    }

    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        // Only handle KO in non-raid contexts to avoid conflicts
        if (!isRaidContext) {
            await handleKO(character._id, createEncounterContext(character, 'tier9_encounter_ko'));
        }
    } else {
        character.currentHearts -= characterDamage;
        // Only use hearts in non-raid contexts to avoid conflicts
        if (!isRaidContext) {
            await useHearts(character._id, characterDamage, createEncounterContext(character, 'tier9_encounter_damage'));
        }
    }

    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { 
        result: outcome, 
        hearts: heartsLostForMonster, 
        playerHearts: {
            current: character.currentHearts,
            max: character.maxHearts
        },
        monsterHearts: {
            current: monster.currentHearts,
            max: monster.maxHearts
        },
        adjustedRandomValue, 
        attackSuccess, 
        defenseSuccess 
    };
};

// ---- Function: getTier10EncounterOutcome ----
// Handles tier 10 monster encounters
const getTier10EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, isRaidContext = false) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    // --- SPECIAL RULE: Aemu and the Dragons always win and 1HKO ---
    if (character.name === 'Aemu' || character.modTitle === 'Dragon') {
        console.log(`[encounterModule.js]: 👑 ${character.name} (${character.modTitle || 'Oracle'}) uses 1HKO ability!`);
        
        // Import flavor text module for mod character victory messages
        const { generateModCharacterVictoryMessage } = require('./flavorTextModule');
        
        // Generate appropriate flavor text based on character type
        const modFlavorText = generateModCharacterVictoryMessage(
            character.name, 
            character.modTitle || 'Oracle', 
            character.modType || 'Power'
        );
        
        outcome = modFlavorText; // Use special mod character flavor text
        heartsLostForMonster = monster.currentHearts || 8; // 1HKO - take all monster hearts
        
        return { 
            result: outcome, 
            hearts: heartsLostForMonster, 
            playerHearts: {
                current: character.currentHearts,
                max: character.maxHearts
            },
            monsterHearts: {
                current: 0, // Monster is instantly defeated
                max: monster.currentHearts || monster.maxHearts || 8
            },
            adjustedRandomValue, 
            attackSuccess, 
            defenseSuccess,
            canLoot: true
        };
    }

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️❤️❤️❤️ 10 hearts!`;
        characterDamage = 10; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️❤️ 8 hearts!`;
        characterDamage = 8; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️ 7 hearts!`;
        characterDamage = 7; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️ 6 hearts!`;
        characterDamage = 6; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 45) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️ 5 hearts!`;
        characterDamage = 5; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 54) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 63) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1; // Fixed: Use actual damage from flavor text
    } else if (adjustedRandomValue <= 72) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨\n⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
        characterDamage = 0; // Fixed: No damage when dodging
    } else if (adjustedRandomValue <= 81) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
        characterDamage = 0; // Fixed: No damage when attacking
    } else if (adjustedRandomValue <= 90) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙2 hearts!`;
        heartsLostForMonster = 2;
        characterDamage = 0; // Fixed: No damage when attacking
    } else {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙💙3 hearts!`;
        heartsLostForMonster = 3;
        characterDamage = 0; // Fixed: No damage when attacking
    }

    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        // Only handle KO in non-raid contexts to avoid conflicts
        if (!isRaidContext) {
            await handleKO(character._id, createEncounterContext(character, 'tier10_encounter_ko'));
        }
    } else {
        character.currentHearts -= characterDamage;
        // Only use hearts in non-raid contexts to avoid conflicts
        if (!isRaidContext) {
            await useHearts(character._id, characterDamage, createEncounterContext(character, 'tier10_encounter_damage'));
        }
    }

    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { 
        result: outcome, 
        hearts: heartsLostForMonster, 
        playerHearts: {
            current: character.currentHearts,
            max: character.maxHearts
        },
        monsterHearts: {
            current: monster.currentHearts,
            max: monster.maxHearts
        },
        adjustedRandomValue, 
        attackSuccess, 
        defenseSuccess 
    };
};

// ============================================================================
// Main Battle Processing Function
// ============================================================================

// ---- Function: processBattle ----
// Main function to process battles and determine outcomes
async function processBattle(character, monster, battleId, originalRoll, interaction) {
    const battleProgress = await getBattleProgressById(battleId);
    if (!battleProgress) {
        console.error(`[encounterModule.js]: ❌ No battle progress for ID: ${battleId}`);
        await interaction.editReply('❌ **An error occurred during the battle: Battle progress not found.**');
        return;
    }

    // Initialize monsterHearts if not present
    if (!battleProgress.monsterHearts) {
        battleProgress.monsterHearts = {
            current: monster.hearts,
            max: monster.hearts
        };
    }
    
    try {
        const attackSuccess = calculateAttackBuff(character, character.attack ?? 0);
        const defenseSuccess = calculateDefenseBuff(character, character.defense ?? 0);
        const adjustedRandomValue = applyBuffs(
            originalRoll,
            attackSuccess,
            defenseSuccess,
            character.attack,
            character.defense
        );

        // ------------------- Mod Character 1-Hit KO Logic -------------------
        // Dragons and other special mod characters (like Aemu) have the ability to 1-hit KO all monsters
        if (character.name === 'Aemu' || character.modTitle === 'Dragon') {
            console.log(`[encounterModule.js]: 👑 Mod character ${character.name} (${character.modTitle || 'Oracle'}) uses 1-hit KO ability on ${monster.name}!`);
            
            // Import flavor text module for mod character victory messages
            const { generateModCharacterVictoryMessage } = require('./flavorTextModule');
            
            // Generate appropriate flavor text based on character type
            const modFlavorText = generateModCharacterVictoryMessage(
                character.name, 
                character.modTitle || 'Oracle', 
                character.modType || 'Power'
            );
            
            // Set monster hearts to 0 to indicate instant defeat
            battleProgress.monsterHearts.current = 0;
            
            // Mod character takes no damage
            const modOutcome = {
                hearts: 0, // Mod character takes no damage
                playerHearts: {
                    current: character.currentHearts,
                    max: character.maxHearts
                },
                monsterHearts: {
                    current: 0, // Monster is instantly defeated
                    max: battleProgress.monsterHearts.max
                },
                diceRoll: originalRoll,
                damageValue: battleProgress.monsterHearts.max, // Show full damage dealt to monster
                adjustedRandomValue: adjustedRandomValue,
                outcome: modFlavorText, // Use special mod character flavor text
                isModKO: true
            };
            
            // Create structured update data for dragon victory
            const updateData = {
                type: 'encounter',
                hearts: battleProgress.monsterHearts.max, // Dragon deals full damage
                damage: battleProgress.monsterHearts.max,
                participantStats: {
                    userId: character.userId,
                    characterId: character._id,
                    damage: battleProgress.monsterHearts.max,
                    lastAction: Date.now()
                },
                monster: {
                    hearts: {
                        current: 0, // Monster instantly defeated
                        max: battleProgress.monsterHearts.max
                    }
                }
            };

            // Update battle progress with mod character victory
            await updateRaidProgress(battleId, updateData);
            
            return modOutcome;
        }

        let outcome;
        if (monster.tier <= 4) {
            outcome = await getEncounterOutcome(character, monster, originalRoll, adjustedRandomValue, attackSuccess, defenseSuccess);
        } else {
            switch (monster.tier) {
                case 5:
                    outcome = await getTier5EncounterOutcome(character, monster, originalRoll, adjustedRandomValue, attackSuccess, defenseSuccess);
                    break;
                case 6:
                    outcome = await getTier6EncounterOutcome(character, monster, originalRoll, adjustedRandomValue, attackSuccess, defenseSuccess);
                    break;
                case 7:
                    outcome = await getTier7EncounterOutcome(character, monster, originalRoll, adjustedRandomValue, attackSuccess, defenseSuccess);
                    break;
                case 8:
                    outcome = await getTier8EncounterOutcome(character, monster, originalRoll, adjustedRandomValue, attackSuccess, defenseSuccess);
                    break;
                case 9:
                    outcome = await getTier9EncounterOutcome(character, monster, originalRoll, adjustedRandomValue, attackSuccess, defenseSuccess);
                    break;
                case 10:
                    outcome = await getTier10EncounterOutcome(character, monster, originalRoll, adjustedRandomValue, attackSuccess, defenseSuccess);
                    if (outcome.result.includes('KO')) {
                        console.log(`[encounterModule.js]: 💀 ${character.name} KO'd by ${monster.name}`);
                        // Only handle KO in non-raid contexts to avoid conflicts
        if (!isRaidContext) {
            await handleKO(character._id, createEncounterContext(character, 'tier10_encounter_ko'));
        }
                    }
                    break;
                default:
                    throw new Error(`Unsupported monster tier: ${monster.tier}`);
            }
        }

        if (!outcome) {
            console.error('[encounterModule.js]: ❌ Failed to calculate encounter outcome');
            return null;
        }

        // Ensure monsterHearts exists and has current property
        if (!battleProgress.monsterHearts || typeof battleProgress.monsterHearts.current === 'undefined') {
            console.error('[encounterModule.js]: ❌ Invalid monster hearts state');
            return null;
        }

        // Calculate new heart values
        const newCurrentHearts = Math.max(0, battleProgress.monsterHearts.current - outcome.hearts);
        const maxHearts = battleProgress.monsterHearts.max;

        // Create structured update data
        const updateData = {
            type: 'encounter',
            hearts: outcome.hearts,
            damage: outcome.hearts,
            participantStats: {
                userId: character.userId,
                characterId: character._id,
                damage: outcome.hearts,
                lastAction: Date.now()
            },
            monster: {
                hearts: {
                    current: newCurrentHearts,
                    max: maxHearts
                }
            }
        };

        // Update battle progress with structured data
        await updateRaidProgress(battleId, updateData);

        return { 
            ...outcome, 
            originalRoll, 
            adjustedRandomValue, 
            attackSuccess, 
            defenseSuccess,
            monsterHearts: {
                current: newCurrentHearts,
                max: maxHearts
            }
        };
    } catch (error) {
        handleError(error, 'encounterModule.js');
        console.error('[encounterModule.js]: ❌ Battle processing error:', error.message);
        return null;
    }
}

async function handleEncounter(character, monster, battleId) {
    try {
        // Battle details logged only in debug mode

        // Calculate damage
        const characterDamage = calculateDamage(character, monster);
        const monsterDamage = calculateDamage(monster, character);

        // Damage details logged only in debug mode

        // Update character stats
        if (monsterDamage > 0) {
            await updateCharacterHearts(character.id, monsterDamage);
        }

        // Update battle progress with structured data
        const updateData = {
            type: 'encounter',
            hearts: characterDamage, // Damage dealt to monster
            damage: characterDamage, // For analytics
            participantStats: {
                userId: character.userId,
                characterId: character.id,
                damage: characterDamage,
                lastAction: Date.now()
            }
        };

        // Update battle progress
        await updateRaidProgress(battleId, updateData);

        return {
            characterDamage,
            monsterDamage,
            message: generateEncounterMessage(character, monster, characterDamage, monsterDamage)
        };
    } catch (error) {
        console.error(`[encounterModule.js]: ❌ Error handling encounter:`, error.message);
        throw error;
    }
}

// ---- Function: getBattleProgressById ----
// Retrieves battle progress for a given battleId from storage
async function getBattleProgressById(battleId) {
  try {
    const progress = await retrieveFromStorage(battleId, 'battle');
    if (!progress) throw new Error(`Battle progress not found for ID: ${battleId}`);
    return progress;
  } catch (error) {
    console.error(`[encounterModule.js]: ❌ Error in getBattleProgressById: ${error.message}`);
    throw error;
  }
}

// ---- Function: updateRaidProgress ----
// Updates raid/battle progress in storage
async function updateRaidProgress(battleId, updateData) {
  try {
    await saveToStorage(battleId, 'battle', updateData);
    console.log(`[encounterModule.js]: 🔄 Updated raid progress for ${battleId}`);
  } catch (error) {
    console.error(`[encounterModule.js]: ❌ Error updating raid progress: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// Module Exports
// ============================================================================
module.exports = {
    getEncounterOutcome,
    processBattle,
    getTier5EncounterOutcome,
    getTier6EncounterOutcome,
    getTier7EncounterOutcome,
    getTier8EncounterOutcome,
    getTier9EncounterOutcome,
    getTier10EncounterOutcome,
    calculateDamage,
    createEncounterContext
}; 