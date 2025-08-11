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
const { handleKO, useHearts } = require('./characterStatsModule');
const Monster = require('../models/MonsterModel');
const { calculateAttackBuff, calculateDefenseBuff, applyBuffs, getDamageResistance } = require('./buffModule');
const { handleError } = require('../utils/globalErrorHandler');
const { retrieveFromStorage, saveToStorage } = require('../utils/storage');

// ============================================================================
// Utility Functions
// ============================================================================

// ------------------- Battle Logging Function -------------------
function logBattleDetails(tier, characterName, monsterName, roll, damage, monsterDamage) {
    console.log(`[encounterModule.js]: ⚔️ ${characterName} vs ${monsterName} (T${tier}) - Roll: ${roll}/100`);
    if (damage > 0 || monsterDamage > 0) {
        console.log(`[encounterModule.js]: 💥 Damage - ${characterName}: ${damage}, ${monsterName}: ${monsterDamage}`);
    }
}

// ------------------- Calculate Damage Function -------------------
// Calculates damage with resistance considerations for electric enemies
function calculateDamage(attacker, defender) {
    try {
        let baseDamage = 1; // Base damage is 1 heart
        
        // Check if this is a monster attacking a character (for resistance calculation)
        if (defender.buff && defender.buff.active) {
            const { getActiveBuffEffects } = require('./elixirModule');
            const buffEffects = getActiveBuffEffects(defender);
            
            // Check if monster is electric type and character has electric resistance
            if (attacker.name && attacker.name.includes('Electric') && buffEffects.electricResistance > 0) {
                // Electric resistance reduces damage by 50% per level
                const resistanceReduction = buffEffects.electricResistance * 0.5;
                baseDamage = Math.max(0, baseDamage - resistanceReduction);
                console.log(`[encounterModule.js]: ⚡ Electric resistance applied - Damage reduced from 1 to ${baseDamage} hearts`);
                
                // Consume electro elixir after use
                const { shouldConsumeElixir, consumeElixirBuff } = require('./elixirModule');
                if (shouldConsumeElixir(defender, 'combat', { monster: attacker })) {
                    consumeElixirBuff(defender);
                    console.log(`[encounterModule.js]: 🧪 Electro Elixir consumed after electric resistance use`);
                }
            }
            
            // Check if monster is fire type and character has fire resistance
            if (attacker.name && attacker.name.includes('Fire') && buffEffects.fireResistance > 0) {
                // Fire resistance reduces damage by 50% per level
                const resistanceReduction = buffEffects.fireResistance * 0.5;
                baseDamage = Math.max(0, baseDamage - resistanceReduction);
                console.log(`[encounterModule.js]: 🔥 Fire resistance applied - Damage reduced from 1 to ${baseDamage} hearts`);
                
                // Consume fireproof elixir after use
                const { shouldConsumeElixir, consumeElixirBuff } = require('./elixirModule');
                if (shouldConsumeElixir(defender, 'combat', { monster: attacker })) {
                    consumeElixirBuff(defender);
                    console.log(`[encounterModule.js]: 🧪 Fireproof Elixir consumed after fire resistance use`);
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
const getEncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {
    try {
        const tier = monster.tier;
        let outcome;

        console.log(`[encounterModule.js]: 📊 Initial values - Roll: ${damageValue}, Adjusted: ${adjustedRandomValue}, Attack: ${attackSuccess}, Defense: ${defenseSuccess}`);

        // --- SPECIAL RULE: Aemu and the Dragons always win and 1HKO ---
        if (character.name === 'Aemu' || character.modTitle === 'Dragon') {
            console.log(`[encounterModule.js]: 👑 Special rule activated for ${character.name} (${character.modTitle || 'Oracle'}) - Always win and 1HKO!`);
            
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
            
            console.log(`[encounterModule.js]: 💥 Special outcome - ${character.name} automatically wins and can loot`);
            
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
        } else if (adjustedRandomValue <= 25) {
            outcome = {
                result: `${tier} HEART(S)`,
                hearts: tier,
                canLoot: false,
            };
        } else if (adjustedRandomValue <= 50) {
            outcome = tier === 1
                ? { result: 'Win!/Loot', canLoot: true, hearts: 0 }
                : { result: `${tier - 1} HEART(S)`, hearts: tier - 1, canLoot: false };
        } else if (adjustedRandomValue <= 75) {
            outcome = tier <= 2
                ? { result: 'Win!/Loot', canLoot: true, hearts: 0 }
                : { result: `${tier - 2} HEART(S)`, hearts: tier - 2, canLoot: false };
        } else if (adjustedRandomValue <= 89) {
            outcome = { result: 'Win!/Loot', canLoot: true, hearts: 0 };
        } else {
            outcome = { result: 'Win!/Loot', canLoot: true, hearts: 0 };
        }

        console.log(`[encounterModule.js]: 💥 Damage calculation - Tier: ${tier}, Hearts: ${outcome.hearts}, Can Loot: ${outcome.canLoot}`);

        if (outcome.hearts > 0) {
            console.log(`[encounterModule.js]: ❤️ Applying damage - ${character.name} loses ${outcome.hearts} hearts`);
            await useHearts(character._id, outcome.hearts);
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
const getTier5EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    // --- SPECIAL RULE: Aemu and the Dragons always win and 1HKO ---
    if (character.name === 'Aemu' || character.modTitle === 'Dragon') {
        console.log(`[encounterModule.js]: 👑 Special rule activated for ${character.name} (${character.modTitle || 'Oracle'}) - Always win and 1HKO!`);
        
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
        
        console.log(`[encounterModule.js]: 💥 Special outcome - ${character.name} automatically wins and can loot`);
        
        return { 
            result: outcome, 
            hearts: heartsLostForMonster, 
            adjustedRandomValue, 
            attackSuccess, 
            defenseSuccess,
            canLoot: true
        };
    }

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️ 5 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️ 3 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️ 2 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 45) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 54) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨`;
    } else if (adjustedRandomValue <= 63) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫`;
    } else if (adjustedRandomValue <= 72) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨\n⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
    } else if (adjustedRandomValue <= 81) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
    } else if (adjustedRandomValue <= 90) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙2 hearts!`;
        heartsLostForMonster = 2;
    } else {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙💙3 hearts!`;
        heartsLostForMonster = 3;
    }

    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        await handleKO(character._id);
    } else {
        character.currentHearts -= characterDamage;
        await useHearts(character._id, characterDamage);
    }

    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { result: outcome, hearts: heartsLostForMonster, adjustedRandomValue, attackSuccess, defenseSuccess };
};

// ---- Function: getTier6EncounterOutcome ----
// Handles tier 6 monster encounters
const getTier6EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    // --- SPECIAL RULE: Aemu and the Dragons always win and 1HKO ---
    if (character.name === 'Aemu' || character.modTitle === 'Dragon') {
        console.log(`[encounterModule.js]: 👑 Special rule activated for ${character.name} (${character.modTitle || 'Oracle'}) - Always win and 1HKO!`);
        
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
        
        console.log(`[encounterModule.js]: 💥 Special outcome - ${character.name} automatically wins and can loot`);
        
        return { 
            result: outcome, 
            hearts: heartsLostForMonster, 
            adjustedRandomValue, 
            attackSuccess, 
            defenseSuccess,
            canLoot: true
        };
    }

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️ 6 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️ 4 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️ 3 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️ 2 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 45) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 54) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 63) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨`;
    } else if (adjustedRandomValue <= 72) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨\n⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
    } else if (adjustedRandomValue <= 81) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
    } else if (adjustedRandomValue <= 90) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙2 hearts!`;
        heartsLostForMonster = 2;
    } else {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙💙3 hearts!`;
        heartsLostForMonster = 3;
    }

    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        await handleKO(character._id);
    } else {
        character.currentHearts -= characterDamage;
        await useHearts(character._id, characterDamage);
    }

    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { result: outcome, hearts: heartsLostForMonster, adjustedRandomValue, attackSuccess, defenseSuccess };
};

// ---- Function: getTier7EncounterOutcome ----
// Handles tier 7 monster encounters
const getTier7EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    // --- SPECIAL RULE: Aemu and the Dragons always win and 1HKO ---
    if (character.name === 'Aemu' || character.modTitle === 'Dragon') {
        console.log(`[encounterModule.js]: 👑 Special rule activated for ${character.name} (${character.modTitle || 'Oracle'}) - Always win and 1HKO!`);
        
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
        
        console.log(`[encounterModule.js]: 💥 Special outcome - ${character.name} automatically wins and can loot`);
        
        return { 
            result: outcome, 
            hearts: heartsLostForMonster, 
            adjustedRandomValue, 
            attackSuccess, 
            defenseSuccess,
            canLoot: true
        };
    }

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️ 7 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️ 5 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️ 4 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️ 3 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 45) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️ 2 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 54) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 63) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨`;
    } else if (adjustedRandomValue <= 72) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨\n⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
    } else if (adjustedRandomValue <= 81) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
    } else if (adjustedRandomValue <= 90) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙2 hearts!`;
        heartsLostForMonster = 2;
    } else {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙💙3 hearts!`;
        heartsLostForMonster = 3;
    }

    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        await handleKO(character._id);
    } else {
        character.currentHearts -= characterDamage;
        await useHearts(character._id, characterDamage);
    }

    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { result: outcome, hearts: heartsLostForMonster, adjustedRandomValue, attackSuccess, defenseSuccess };
};

// ---- Function: getTier8EncounterOutcome ----
// Handles tier 8 monster encounters
const getTier8EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    // --- SPECIAL RULE: Aemu and the Dragons always win and 1HKO ---
    if (character.name === 'Aemu' || character.modTitle === 'Dragon') {
        console.log(`[encounterModule.js]: 👑 Special rule activated for ${character.name} (${character.modTitle || 'Oracle'}) - Always win and 1HKO!`);
        
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
        
        console.log(`[encounterModule.js]: 💥 Special outcome - ${character.name} automatically wins and can loot`);
        
        return { 
            result: outcome, 
            hearts: heartsLostForMonster, 
            adjustedRandomValue, 
            attackSuccess, 
            defenseSuccess,
            canLoot: true
        };
    }

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️❤️ 8 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️ 6 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️ 5 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️ 4 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 45) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️ 3 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 54) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 63) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨`;
    } else if (adjustedRandomValue <= 72) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨\n⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
    } else if (adjustedRandomValue <= 81) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
    } else if (adjustedRandomValue <= 90) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙2 hearts!`;
        heartsLostForMonster = 2;
    } else {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙💙3 hearts!`;
        heartsLostForMonster = 3;
    }

    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        await handleKO(character._id);
    } else {
        character.currentHearts -= characterDamage;
        await useHearts(character._id, characterDamage);
    }

    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { result: outcome, hearts: heartsLostForMonster, adjustedRandomValue, attackSuccess, defenseSuccess };
};

// ---- Function: getTier9EncounterOutcome ----
// Handles tier 9 monster encounters
const getTier9EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    // --- SPECIAL RULE: Aemu and the Dragons always win and 1HKO ---
    if (character.name === 'Aemu' || character.modTitle === 'Dragon') {
        console.log(`[encounterModule.js]: 👑 Special rule activated for ${character.name} (${character.modTitle || 'Oracle'}) - Always win and 1HKO!`);
        
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
        
        console.log(`[encounterModule.js]: 💥 Special outcome - ${character.name} automatically wins and can loot`);
        
        return { 
            result: outcome, 
            hearts: heartsLostForMonster, 
            adjustedRandomValue, 
            attackSuccess, 
            defenseSuccess,
            canLoot: true
        };
    }

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️❤️❤️ 9 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️ 7 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️ 6 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️ 5 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 45) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️ 4 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 54) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 63) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨`;
    } else if (adjustedRandomValue <= 72) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨\n⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
    } else if (adjustedRandomValue <= 81) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
    } else if (adjustedRandomValue <= 90) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙2 hearts!`;
        heartsLostForMonster = 2;
    } else {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙💙3 hearts!`;
        heartsLostForMonster = 3;
    }

    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        await handleKO(character._id);
    } else {
        character.currentHearts -= characterDamage;
        await useHearts(character._id, characterDamage);
    }

    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { result: outcome, hearts: heartsLostForMonster, adjustedRandomValue, attackSuccess, defenseSuccess };
};

// ---- Function: getTier10EncounterOutcome ----
// Handles tier 10 monster encounters
const getTier10EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    // --- SPECIAL RULE: Aemu and the Dragons always win and 1HKO ---
    if (character.name === 'Aemu' || character.modTitle === 'Dragon') {
        console.log(`[encounterModule.js]: 👑 Special rule activated for ${character.name} (${character.modTitle || 'Oracle'}) - Always win and 1HKO!`);
        
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
        
        console.log(`[encounterModule.js]: 💥 Special outcome - ${character.name} automatically wins and can loot`);
        
        return { 
            result: outcome, 
            hearts: heartsLostForMonster, 
            adjustedRandomValue, 
            attackSuccess, 
            defenseSuccess,
            canLoot: true
        };
    }

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️❤️❤️❤️ 10 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️❤️ 8 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️ 7 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️ 6 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 45) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️ 5 hearts!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 54) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = calculateDamage(monster, character);
    } else if (adjustedRandomValue <= 63) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨`;
    } else if (adjustedRandomValue <= 72) {
        outcome = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨\n⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
    } else if (adjustedRandomValue <= 81) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        heartsLostForMonster = 1;
    } else if (adjustedRandomValue <= 90) {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙2 hearts!`;
        heartsLostForMonster = 2;
    } else {
        outcome = `⚔️🏹 ${character.name} attacks! The monster loses 💙💙💙3 hearts!`;
        heartsLostForMonster = 3;
    }

    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        await handleKO(character._id);
    } else {
        character.currentHearts -= characterDamage;
        await useHearts(character._id, characterDamage);
    }

    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { result: outcome, hearts: heartsLostForMonster, adjustedRandomValue, attackSuccess, defenseSuccess };
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
        const attackSuccess = calculateAttackBuff(character);
        const defenseSuccess = calculateDefenseBuff(character);
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
                        await handleKO(character._id);
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
    calculateDamage
}; 