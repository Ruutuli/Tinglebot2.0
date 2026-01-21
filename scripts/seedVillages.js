// ============================================================================
// ---- Seed Villages Script ----
// ============================================================================
// This script randomly sets levels (1-3), materials, and tokens for villages
// for testing purposes

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const dbConfig = require('@app/shared/config/database');
const { Village, VILLAGE_CONFIG, DEFAULT_HEALTH, DEFAULT_TOKEN_REQUIREMENTS } = require('@app/shared/models/VillageModel');

// ============================================================================
// ---- Helper Functions ----
// ============================================================================

// ------------------- Function: getRandomInt -------------------
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ------------------- Function: getRandomFloat -------------------
function getRandomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

// ------------------- Function: randomizeMaterials -------------------
// Randomly sets material current values based on the village level
// Materials are seeded to meet requirements for the NEXT level upgrade
function randomizeMaterials(villageConfig, level) {
    const materials = {};
    
    // Determine target level for materials (materials needed for next level upgrade)
    // Level 1 villages need materials for level 2
    // Level 2 villages need materials for level 3
    // Level 3 villages don't need materials for upgrade (max level)
    const targetLevel = level < 3 ? level + 1 : level;
    
    for (const [materialName, materialData] of Object.entries(villageConfig.materials)) {
        const required = materialData.required;
        const requiredForTargetLevel = required[targetLevel];
        
        // If material is not required for target level, set current based on lower level or 0
        if (!requiredForTargetLevel) {
            // Check if material is required for current level
            const requiredForCurrentLevel = required[level] || 0;
            if (requiredForCurrentLevel > 0 && level === targetLevel) {
                // Level 3: materials can be anything, random between 0-150% of current level requirement
                const percentage = getRandomFloat(0, 1.5);
                materials[materialName] = {
                    current: Math.floor(requiredForCurrentLevel * percentage),
                    required: required
                };
            } else {
                materials[materialName] = {
                    current: 0,
                    required: required
                };
            }
            continue;
        }
        
        // Random percentage of required for target level (50% to 80%)
        // This creates variety: some villages partial (50-79%), capped at 80%
        // Ensures at least 50% so materials are "seeded" and villages can progress
        // Materials will never exceed 80% of the required amount
        const percentage = getRandomFloat(0.5, 0.8);
        const current = Math.floor(requiredForTargetLevel * percentage);
        
        materials[materialName] = {
            current: current,
            required: required
        };
    }
    
    return materials;
}

// ------------------- Function: randomizeTokens -------------------
// Randomly sets currentTokens based on the village level
// Tokens are seeded to meet requirements for the NEXT level upgrade
// Tokens will not exceed the requirement for the target level
function randomizeTokens(level) {
    const requirements = DEFAULT_TOKEN_REQUIREMENTS;
    
    // For level 1, random between 50% and 100% of requirement for level 2
    // Ensures tokens are seeded but don't exceed level 2 requirement
    if (level === 1) {
        const requiredForNext = requirements[2] || 10000;
        const min = Math.floor(requiredForNext * 0.5);
        const max = requiredForNext; // Don't exceed the requirement
        return getRandomInt(min, max);
    }
    
    // For level 2, random between 50% and 100% of requirement for level 3
    // Ensures tokens are seeded for next level upgrade but don't exceed level 3 requirement
    if (level === 2) {
        const requiredForNext = requirements[3] || 50000;
        const min = Math.floor(requiredForNext * 0.5);
        const max = requiredForNext; // Don't exceed the requirement
        return getRandomInt(min, max);
    }
    
    // For level 3, random between 0% and 100% of level 3 requirement
    // Max level villages can have tokens but won't exceed the max requirement
    if (level === 3) {
        const requirement = requirements[3] || 50000;
        const max = requirement; // Don't exceed the requirement
        return getRandomInt(0, max);
    }
    
    return 0;
}

// ------------------- Function: randomizeHealth -------------------
// Randomly sets health based on the village level
function randomizeHealth(level) {
    const maxHealth = DEFAULT_HEALTH[level] || 100;
    
    // Random health between 50% and 100% of max (or exactly max for some)
    const healthPercentage = getRandomFloat(0.5, 1.0);
    const health = Math.floor(maxHealth * healthPercentage);
    
    return Math.max(1, health); // Ensure health is at least 1
}

// ------------------- Function: calculateStatus -------------------
// Calculates the village status based on level and health
function calculateStatus(level, health) {
    const maxHealth = DEFAULT_HEALTH[level] || 100;
    
    if (health < maxHealth) {
        return 'damaged';
    }
    
    if (level === 3) {
        return 'max';
    }
    
    return 'upgradable';
}

// ============================================================================
// ---- Main Seed Function ----
// ============================================================================

async function seedVillages() {
    try {
        // Connect to database
        const mongoUri = dbConfig.tinglebot || process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error('MongoDB URI not found. Please set MONGODB_URI or MONGODB_TINGLEBOT_URI in .env file.');
        }
        
        console.log('[seedVillages] Connecting to database...');
        await mongoose.connect(mongoUri);
        console.log('[seedVillages] ✅ Connected to database');
        
        // Get all villages from config
        const villageNames = Object.keys(VILLAGE_CONFIG);
        console.log(`[seedVillages] Found ${villageNames.length} villages to seed: ${villageNames.join(', ')}`);
        
        // Seed each village
        for (const villageName of villageNames) {
            const villageConfig = VILLAGE_CONFIG[villageName];
            
            // Find or create village
            let village = await Village.findOne({ name: villageConfig.name });
            
            if (!village) {
                console.log(`[seedVillages] ⚠️ Village "${villageConfig.name}" not found. Creating new village...`);
                village = new Village({
                    ...villageConfig,
                    materials: Object.fromEntries(
                        Object.entries(villageConfig.materials).map(([key, value]) => [
                            key,
                            { current: 0, required: value.required }
                        ])
                    )
                });
            }
            
            // Randomly assign level (1-3)
            const randomLevel = getRandomInt(1, 3);
            console.log(`[seedVillages] Setting "${villageConfig.name}" to level ${randomLevel}...`);
            
            // Update village properties
            village.level = randomLevel;
            village.materials = randomizeMaterials(villageConfig, randomLevel);
            village.currentTokens = randomizeTokens(randomLevel);
            village.health = randomizeHealth(randomLevel);
            village.status = calculateStatus(randomLevel, village.health);
            village.levelHealth = new Map(Object.entries(DEFAULT_HEALTH));
            village.tokenRequirements = new Map(Object.entries(DEFAULT_TOKEN_REQUIREMENTS));
            
            // If damaged, set lastDamageTime to a random time in the past 7 days
            if (village.status === 'damaged') {
                const daysAgo = getRandomInt(0, 7);
                const hoursAgo = getRandomInt(0, 23);
                village.lastDamageTime = new Date(Date.now() - (daysAgo * 24 * 60 * 60 * 1000) - (hoursAgo * 60 * 60 * 1000));
            } else {
                village.lastDamageTime = null;
            }
            
            // Save village
            await village.save();
            console.log(`[seedVillages] ✅ Seeded "${villageConfig.name}": Level ${randomLevel}, Health ${village.health}/${DEFAULT_HEALTH[randomLevel]}, Tokens ${village.currentTokens}, Status ${village.status}`);
        }
        
        console.log('[seedVillages] ✅ All villages seeded successfully!');
        
    } catch (error) {
        console.error('[seedVillages] ❌ Error seeding villages:', error);
        throw error;
    } finally {
        // Close database connection
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('[seedVillages] Database connection closed');
        }
    }
}

// ============================================================================
// ---- Script Execution ----
// ============================================================================

if (require.main === module) {
    seedVillages()
        .then(() => {
            console.log('[seedVillages] Script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('[seedVillages] Script failed:', error);
            process.exit(1);
        });
}

module.exports = { seedVillages };
