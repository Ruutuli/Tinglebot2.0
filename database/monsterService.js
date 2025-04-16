// =================== DATABASE MODELS ===================
// ------------------- Import the Monster model -------------------
// Import the Monster model from the local models folder.
const Monster = require('../models/MonsterModel');



const { handleError } = require('../utils/globalErrorHandler');
// =================== UTILITY FUNCTIONS ===================
// ------------------- Convert a string to camel case -------------------
// This utility function converts any given string to camelCase by removing special characters
// and formatting the letters accordingly.
function toCamelCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w|\s+|[-()/])/g, (match, index) => {
        if (match === '-' || match === '(' || match === ')' || match === '/') return ''; 
        return index === 0 ? match.toLowerCase() : match.toUpperCase();
    });
}



// =================== DATABASE SERVICES ===================
// ------------------- Fetch all monsters from the database -------------------
// Retrieves all monsters using the Monster model. Extensive error logging is provided.
const fetchAllMonsters = async () => {
    try {
        return await Monster.find();
    } catch (error) {
    handleError(error, 'monsterService.js');

        console.error('[monsterService.js]: ❌ Error fetching monsters:', error);
        throw error;
    }
};

// ------------------- Fetch a monster by its name -------------------
// Retrieves a single monster by matching its name. Errors are logged with detailed context.
const fetchMonsterByName = async (name) => {
    try {
        return await Monster.findOne({ name });
    } catch (error) {
    handleError(error, 'monsterService.js');

        console.error(`[monsterService.js]: ❌ Error fetching monster with name "${name}":`, error);
        throw error;
    }
};

// ------------------- Get monster details by name mapping -------------------
// Uses a name mapping (converted to camelCase) to fetch a monster's details from the database.
const getMonsterDetailsByMapping = async (nameMapping) => {
    if (!nameMapping) {
        console.error('[monsterService.js]: ❌ No nameMapping provided.');
        return null;
    }
    const normalizedMapping = toCamelCase(nameMapping);
    try {
        const monster = await Monster.findOne({ nameMapping: normalizedMapping });
        if (!monster) {
            console.error(`[monsterService.js]: ❌ No monster found with nameMapping: ${normalizedMapping}`);
            return null;
        }
        return monster;
    } catch (error) {
    handleError(error, 'monsterService.js');

        console.error('[monsterService.js]: ❌ Error fetching monster by mapping:', error);
        throw error;
    }
};

// ------------------- Get monsters above a specified tier -------------------
// Retrieves all monsters that have a tier greater than or equal to the provided minimum (default is 5).
// Randomly selects one monster from the filtered results.
async function getMonstersAboveTier(minTier = 5) {
    try {
        const monsters = await Monster.find({ tier: { $gte: minTier } }).exec();
        if (!monsters || monsters.length === 0) {
            console.error(`[monsterService.js]: ❌ No monsters found above tier ${minTier}.`);
            return null;
        }
        // Randomly select a monster from the filtered results
        const randomMonster = monsters[Math.floor(Math.random() * monsters.length)];
        return randomMonster;
    } catch (error) {
    handleError(error, 'monsterService.js');

        console.error(`[monsterService.js]: ❌ Error fetching monsters above tier ${minTier}:`, error);
        return null;
    }
}

// ------------------- Get monsters above a specified tier by region -------------------
// Retrieves monsters that are above a specified tier for a specific region. The region is used as
// a filter in addition to the tier. A random monster is selected from the filtered results.
async function getMonstersAboveTierByRegion(minTier = 5, region) {
    try {
        if (!region) {
            console.error('[monsterService.js]: ❌ No region provided for filtering monsters.');
            return null;
        }
        const filter = {
            tier: { $gte: minTier },
            [region.toLowerCase()]: true
        };
        const monsters = await Monster.find(filter).exec();
        if (!monsters || monsters.length === 0) {
            console.error(`[monsterService.js]: ❌ No monsters found above tier ${minTier} for region: ${region}.`);
            return null;
        }
        // Randomly select a monster from the filtered results
        const randomMonster = monsters[Math.floor(Math.random() * monsters.length)];
        return randomMonster;
    } catch (error) {
    handleError(error, 'monsterService.js');

        console.error(`[monsterService.js]: ❌ Error fetching monsters above tier ${minTier} for region "${region}":`, error);
        return null;
    }
}



// =================== EXPORT FUNCTIONS ===================
// ------------------- Export all database service and utility functions -------------------
// Exports all functions to be used by other modules.
module.exports = {
    fetchAllMonsters,
    fetchMonsterByName,
    getMonsterDetailsByMapping,
    getMonstersAboveTier,
    getMonstersAboveTierByRegion
};
