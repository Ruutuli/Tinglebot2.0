// ------------------- Import necessary utilities or modules -------------------
const { useHearts, handleKO } = require('../modules/characterStatsModule');  // Import heart handling functions

// ------------------- Tier 5 Encounter Outcome -------------------
const getTier5EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ALL hearts! You are KO'd.`;
        character.currentHearts = 0;
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️ 3 hearts!`;
        characterDamage = 3;
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️ 2 hearts!`;
        characterDamage = 2;
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1;
    } else if (adjustedRandomValue <= 45) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1;
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

    // Log battle details for tracking
logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    // Handle character heart reduction and KO logic
    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        await handleKO(character._id);  // KO handling
    } else {
        character.currentHearts -= characterDamage;
        await useHearts(character._id, characterDamage);  // Deduct hearts
    }

    // Handle monster heart reduction
    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { result: outcome, hearts: heartsLostForMonster, adjustedRandomValue, attackSuccess, defenseSuccess };
};

// ------------------- Tier 6 Encounter Outcome -------------------
const getTier6EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ALL hearts! You are KO'd.`;
        character.currentHearts = 0;
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️ 4 hearts!`;
        characterDamage = 4;
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️ 3 hearts!`;
        characterDamage = 3;
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️ 2 hearts!`;
        characterDamage = 2;
    } else if (adjustedRandomValue <= 45) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1;
    } else if (adjustedRandomValue <= 54) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1;
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

    // Log battle details for tracking
    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    // Handle character heart reduction and KO logic
    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        await handleKO(character._id);  // KO handling
    } else {
        character.currentHearts -= characterDamage;
        await useHearts(character._id, characterDamage);  // Deduct hearts
    }

    // Handle monster heart reduction
    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { result: outcome, hearts: heartsLostForMonster, adjustedRandomValue, attackSuccess, defenseSuccess };
};

// ------------------- Tier 7 Encounter Outcome -------------------
const getTier7EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ALL hearts! You are KO'd.`;
        character.currentHearts = 0;
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️ 5 hearts!`;
        characterDamage = 5;
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️ 4 hearts!`;
        characterDamage = 4;
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️ 3 hearts!`;
        characterDamage = 3;
    } else if (adjustedRandomValue <= 45) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️ 2 hearts!`;
        characterDamage = 2;
    } else if (adjustedRandomValue <= 54) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1;
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

    // Log battle details for tracking
    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    // Handle character heart reduction and KO logic
    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        await handleKO(character._id);  // KO handling
    } else {
        character.currentHearts -= characterDamage;
        await useHearts(character._id, characterDamage);  // Deduct hearts
    }

    // Handle monster heart reduction
    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { result: outcome, hearts: heartsLostForMonster, adjustedRandomValue, attackSuccess, defenseSuccess };
};

// ------------------- Tier 8 Encounter Outcome -------------------
const getTier8EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {
    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ALL hearts! You are KO'd.`;
        character.currentHearts = 0;
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️ 6 hearts!`;
        characterDamage = 6;
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️ 5 hearts!`;
        characterDamage = 5;
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️ 4 hearts!`;
        characterDamage = 4;
    } else if (adjustedRandomValue <= 45) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️ 3 hearts!`;
        characterDamage = 3;
    } else if (adjustedRandomValue <= 54) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1;
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

    // Log battle details for tracking
    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    // Handle character heart reduction and KO logic
    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        await handleKO(character._id);  // KO handling
    } else {
        character.currentHearts -= characterDamage;
        await useHearts(character._id, characterDamage);  // Deduct hearts
    }

    // Handle monster heart reduction
    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { result: outcome, hearts: heartsLostForMonster, adjustedRandomValue, attackSuccess, defenseSuccess };
};

// ------------------- Tier 9 Encounter Outcome -------------------
const getTier9EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {

    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ALL hearts! You are KO'd.`;
        character.currentHearts = 0;
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️ 7 hearts!`;
        characterDamage = 7;
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️ 6 hearts!`;
        characterDamage = 6;
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️ 5 hearts!`;
        characterDamage = 5;
    } else if (adjustedRandomValue <= 45) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️ 4 hearts!`;
        characterDamage = 4;
    } else if (adjustedRandomValue <= 54) {
        outcome = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫\n💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️ 1 heart!`;
        characterDamage = 1;
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

    // Log battle details for tracking
    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    // Handle character heart reduction and KO logic
    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        await handleKO(character._id);  // KO handling
    } else {
        character.currentHearts -= characterDamage;
        await useHearts(character._id, characterDamage);  // Deduct hearts
    }

    // Handle monster heart reduction
    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { result: outcome, hearts: heartsLostForMonster, adjustedRandomValue, attackSuccess, defenseSuccess };
};

// ------------------- Tier 10 Encounter Outcome -------------------
const getTier10EncounterOutcome = async (character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess) => {

    let heartsLostForMonster = 0;
    let outcome;
    let characterDamage = 0;

    if (adjustedRandomValue <= 9) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ALL hearts! You are KO'd.`;
        character.currentHearts = 0;
    } else if (adjustedRandomValue <= 18) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️❤️❤️ 8 hearts!`;
        characterDamage = 8;
    } else if (adjustedRandomValue <= 27) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️❤️ 6 hearts!`;
        characterDamage = 6;
    } else if (adjustedRandomValue <= 36) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️❤️ 5 hearts!`;
        characterDamage = 5;
    } else if (adjustedRandomValue <= 45) {
        outcome = `💥💀 The monster ${monster.name} attacks! ${character.name} loses ❤️❤️❤️❤️ 4 hearts!`;
        characterDamage = 4;
    } else if (adjustedRandomValue <= 63) {
        outcome = `💥💀 The monster ${monster.name} attacks! You lose ❤️❤️ 2 hearts!\n⚔️🏹 ${character.name} attacks! The monster loses 💙1 heart!`;
        characterDamage = 2;
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

    // Log battle details for tracking
    logBattleDetails(monster.tier, character.name, monster.name, adjustedRandomValue, characterDamage, heartsLostForMonster);

    // Handle character heart reduction and KO logic
    if (character.currentHearts - characterDamage <= 0) {
        outcome += `\n${character.name} has been defeated by the ${monster.name}!`;
        character.currentHearts = 0;
        await handleKO(character._id);  // KO handling
    } else {
        character.currentHearts -= characterDamage;
        await useHearts(character._id, characterDamage);  // Deduct hearts
    }

    // Handle monster heart reduction
    if (monster.currentHearts - heartsLostForMonster <= 0) {
        outcome += `\nYou have defeated the ${monster.name}!`;
        monster.currentHearts = 0;
    } else {
        monster.currentHearts -= heartsLostForMonster;
    }

    return { result: outcome, hearts: heartsLostForMonster, adjustedRandomValue, attackSuccess, defenseSuccess };
};

// ------------------- Helper Function: Log Battle Details -------------------
const logBattleDetails = (tier, characterName, monsterName, adjustedRandomValue, characterDamage, heartsLostForMonster) => {
    //this does nothing
};

// Exporting all functions
module.exports = {
    getTier5EncounterOutcome,
    getTier6EncounterOutcome,
    getTier7EncounterOutcome,
    getTier8EncounterOutcome,
    getTier9EncounterOutcome,
    getTier10EncounterOutcome,
};
