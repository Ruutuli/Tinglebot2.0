// ------------------- Import the Monster model -------------------
const Monster = require('../models/MonsterModel');

// ------------------- Fetch all monsters from the database -------------------
const fetchAllMonsters = async () => {
    try {
        return await Monster.find();
    } catch (error) {
        console.error('❌ Error fetching monsters:', error);
        throw error;
    }
};

// ------------------- Fetch a monster by its name -------------------
const fetchMonsterByName = async (name) => {
    try {
        return await Monster.findOne({ name });
    } catch (error) {
        console.error(`❌ Error fetching monster with name ${name}:`, error);
        throw error;
    }
};

// ------------------- Convert a string to camel case -------------------
function toCamelCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w|\s+|[-()/])/g, (match, index) => {
        if (match === '-' || match === '(' || match === ')' || match === '/') return ''; 
        return index === 0 ? match.toLowerCase() : match.toUpperCase();
    });
}

// ------------------- Get monster details by name mapping -------------------
const getMonsterDetailsByMapping = async (nameMapping) => {
    if (!nameMapping) {
        console.error('❌ No nameMapping provided.');
        return null;
    }
    const normalizedMapping = toCamelCase(nameMapping);
    const monster = await Monster.findOne({ nameMapping: normalizedMapping });
    if (!monster) {
        console.error(`❌ No monster found with nameMapping: ${normalizedMapping}`);
        return null;
    }
    return monster;
};

// ------------------- getMonstersAboveTier  -------------------

// Fetch all monsters that are above a specified tier (minimum tier 5)
async function getMonstersAboveTier(minTier = 5) {
    try {
        const monsters = await Monster.find({ tier: { $gte: minTier } }).exec(); // $gte ensures tier >= 5
        
        if (!monsters || monsters.length === 0) {
            console.error(`❌ No monsters found above tier ${minTier}.`);
            return null;
        }

        // Randomly select a monster from the filtered results
        const randomMonster = monsters[Math.floor(Math.random() * monsters.length)];

        console.log(`🧟 Monster selected: ${randomMonster.name}, Tier: ${randomMonster.tier}, Hearts: ${randomMonster.hearts}`);
        return randomMonster;  // No need to set currentHearts here
    } catch (error) {
        console.error(`Error fetching monsters above tier ${minTier}: ${error}`);
        return null;
    }
}

// ------------------- getMonstersAboveTierByRegion -------------------

// Fetch all monsters above a specified tier (minimum tier 5) for a specific region
async function getMonstersAboveTierByRegion(minTier = 5, region) {
    try {
        if (!region) {
            console.error('❌ No region provided for filtering monsters.');
            return null;
        }

        const filter = {
            tier: { $gte: minTier }, // Tier filter
            [region.toLowerCase()]: true, // Region-specific filter
        };

        const monsters = await Monster.find(filter).exec();
        if (!monsters || monsters.length === 0) {
            console.error(`❌ No monsters found above tier ${minTier} for region: ${region}.`);
            return null;
        }

        // Randomly select a monster from the filtered results
        const randomMonster = monsters[Math.floor(Math.random() * monsters.length)];

        console.log(`🧟 Monster selected for region ${region}: ${randomMonster.name}, Tier: ${randomMonster.tier}, Hearts: ${randomMonster.hearts}`);
        return randomMonster;
    } catch (error) {
        console.error(`Error fetching monsters above tier ${minTier} for region ${region}:`, error);
        return null;
    }
}

// ------------------- Export functions -------------------
module.exports = {
    fetchAllMonsters,
    fetchMonsterByName,
    getMonsterDetailsByMapping,
    getMonstersAboveTier,
    getMonstersAboveTierByRegion
};

