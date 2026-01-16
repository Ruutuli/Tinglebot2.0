// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const mongoose = require('mongoose');
const { EmbedBuilder } = require('discord.js');

// ============================================================================
// ---- Utility Functions ----
// ============================================================================
const { handleError } = require('../../shared/utils/globalErrorHandler');
const { capitalizeVillageName } = require('../../shared/utils/stringUtils');

// ============================================================================
// ---- Imports ----
// ============================================================================
const { 
    Village,
    VILLAGE_CONFIG
} = require('../../shared/models/VillageModel');

// ============================================================================
// ---- Constants ----
// ============================================================================
// Token-to-HP conversion rate (same as repair system)
// 100 tokens = 1 HP (consistent across all levels)
const TOKENS_PER_HP = 100;

// ============================================================================
// ---- Initialization Functions ----
// ============================================================================

// ---- Function: initializeVillages ----
// Initializes all villages in the database with default values
const initializeVillages = async () => {
    for (const [name, config] of Object.entries(VILLAGE_CONFIG)) {
        try {
            const existingVillage = await Village.findOne({ name });
            if (!existingVillage) {
                // Create new village with initial state
                const villageData = {
                    ...config,
                    materials: Object.fromEntries(
                        Object.entries(config.materials).map(([key, value]) => [
                            key,
                            { current: 0, required: value.required }
                        ])
                    )
                };
                await Village.create(villageData);
                console.log(`[villageModule.js] ✅ Initialized village: ${name}`);
            } else {
                console.log(`[villageModule.js] ℹ️ Village already exists: ${name}`);
            }
        } catch (error) {
            handleError(error, 'villageModule.js');
            console.error(`[villageModule.js] ❌ Error initializing village: ${name}`, error);
        }
    }
};

// ------------------- Function to Initialize a Village -------------------
function initializeVillage(villageName) {
    const capitalizedName = capitalizeVillageName(villageName);
    console.log(`[VILLAGE] Initializing village: ${capitalizedName}`);
    if (!villages[capitalizedName]) {
        villages[capitalizedName] = {
            health: 100, // Default health value
            resources: 50, // Default resources value
        };
        console.log(`[VILLAGE] Village "${capitalizedName}" initialized.`);
    } else {
        console.log(`[VILLAGE] Village "${capitalizedName}" already exists.`);
    }
    return villages[capitalizedName];
}

// ------------------- Function to Update Village Health -------------------
async function updateVillageHealth(villageName, healthChange) {
    const capitalizedName = capitalizeVillageName(villageName);
    console.log(`[VILLAGE] Updating health for village: ${capitalizedName}, Change: ${healthChange}`);
    if (!villages[capitalizedName]) {
        console.warn(`[VILLAGE] Village "${capitalizedName}" does not exist. Initializing it now.`);
        initializeVillage(capitalizedName);
    }
    villages[capitalizedName].health = Math.max(villages[capitalizedName].health + healthChange, 0); // Ensure health doesn't drop below 0
    console.log(`[VILLAGE] Village "${capitalizedName}" health updated to ${villages[capitalizedName].health}.`);
    return villages[capitalizedName].health;
}

// ------------------- Function to Get Village Information -------------------
async function getVillageInfo(villageName) {
    const capitalizedName = capitalizeVillageName(villageName);
    console.log(`[VILLAGE] Retrieving information for village: ${capitalizedName}`);
    if (!villages[capitalizedName]) {
        console.warn(`[VILLAGE] Village "${capitalizedName}" does not exist. Initializing it now.`);
        initializeVillage(capitalizedName);
    }
    return villages[capitalizedName];
}

// ------------------- Function: calculateVillageStatus -------------------
// Calculates the village status based on level and HP
function calculateVillageStatus(village) {
    if (village.level === 3) {
        return 'max';
    }
    
    const maxHealth = village.levelHealth instanceof Map 
        ? village.levelHealth.get(village.level.toString()) 
        : village.levelHealth[village.level.toString()] || 100;
    
    if (village.health < maxHealth) {
        return 'damaged';
    }
    
    return 'upgradable';
}

// ------------------- Function: updateVillageStatus -------------------
// Updates the village status based on current level and HP
function updateVillageStatus(village) {
    const newStatus = calculateVillageStatus(village);
    village.status = newStatus;
    return newStatus;
}

// ------------------- Function: checkVillageStatus -------------------
// Checks and returns the status of a village by name
async function checkVillageStatus(villageName) {
    try {
        const village = await Village.findOne({ name: { $regex: `^${villageName}$`, $options: 'i' } });
        if (!village) {
            return null; // Village not found
        }
        // Ensure status is up to date
        updateVillageStatus(village);
        return village.status;
    } catch (error) {
        handleError(error, 'villageModule.js');
        console.error(`[checkVillageStatus] Error checking village status for "${villageName}":`, error.message);
        return null;
    }
}

// ------------------- Handle Village Damage -------------------
async function damageVillage(villageName, damageAmount) {
    try {
        const village = await Village.findOne({ name: { $regex: `^${villageName}$`, $options: 'i' } });
        if (!village) {
            throw new Error(`[damageVillage] Village "${villageName}" not found. Ensure the name is correct.`);
        }

        const maxHealth = village.levelHealth instanceof Map 
            ? village.levelHealth.get(village.level.toString()) 
            : village.levelHealth[village.level.toString()] || 100;

        // Calculate damage percentage: damage_percentage = min(damage_amount / max_HP, 0.25)
        // This caps resource loss at 25% per event to prevent catastrophic single-event losses
        const damagePercentage = Math.min(damageAmount / maxHealth, 0.25);

        // Apply damage directly to village health (damage stacks across events)
        const healthBefore = village.health;
        village.health = Math.max(0, village.health - damageAmount);
        const actualHPLost = healthBefore - village.health; // Actual HP lost (capped at current health)
        console.log(`[damageVillage] Updated health for village "${villageName}" to ${village.health}/${maxHealth} (damage: ${damageAmount} HP, actual HP lost: ${actualHPLost})`);

        const removedResources = [];
        // Convert Map to object for easier manipulation
        let materials = {};
        if (village.materials instanceof Map) {
            for (const [key, value] of village.materials.entries()) {
                materials[key] = value;
            }
        } else {
            materials = village.materials || {};
        }

        // Token loss: directly tied to HP loss (calculated first, before level-down check)
        // Formula: tokens_lost = actual_HP_lost × TOKENS_PER_HP
        // Tokens and HP are directly proportional - when HP is lost, equivalent tokens are lost
        // Same rate as repair: 100 tokens = 1 HP
        const currentTokens = village.currentTokens || 0;
        const tokensToLose = actualHPLost * TOKENS_PER_HP; // Direct conversion: HP lost × 100
        
        if (currentTokens > 0 && tokensToLose > 0) {
            // Cap token loss to available tokens (can't lose more than village has)
            const removedTokens = Math.min(tokensToLose, currentTokens);
            village.currentTokens = Math.max(0, currentTokens - removedTokens);
            removedResources.push({ type: 'Tokens', amount: removedTokens });
            console.log(`[damageVillage] Removed ${removedTokens} tokens from "${villageName}" (${actualHPLost} HP lost × ${TOKENS_PER_HP} tokens/HP = ${tokensToLose} tokens, capped at ${removedTokens} from ${currentTokens} available).`);
        } else if (tokensToLose > 0) {
            // If village has 0 tokens, no tokens are lost (but HP is still lost)
            console.log(`[damageVillage] Village "${villageName}" has 0 tokens, no tokens lost (but ${actualHPLost} HP was lost, would have lost ${tokensToLose} tokens).`);
        }

        // Resource loss occurs when HP reaches 0 (level drop) AND on every damage event
        if (village.health === 0) {
            // Level down logic - village drops one level
            console.log(`[damageVillage] Village "${villageName}" health reached 0. Decreasing level.`);
            if (village.level > 1) {
                village.level -= 1;

                // Reset health for the new level
                const newMaxHealth = village.levelHealth instanceof Map 
                    ? village.levelHealth.get(village.level.toString()) 
                    : village.levelHealth[village.level.toString()] || 100;
                village.health = newMaxHealth;

                // Set all tokens and materials to 0 (all resources lost on level drop)
                for (const material in materials) {
                    const materialData = materials[material];
                    if (materialData && typeof materialData === 'object' && 'current' in materialData) {
                        const removedAmount = materialData.current || 0; // Remove everything
                        // Create a new object to ensure Mongoose detects the change
                        const updatedMaterialData = { ...materialData, current: 0 };
                        materials[material] = updatedMaterialData;
                        if (removedAmount > 0) {
                            removedResources.push({ type: 'Material', name: material, amount: removedAmount });
                        }
                    }
                }
                // Update materials Map - create new objects to ensure Mongoose detects changes
                for (const [key, value] of Object.entries(materials)) {
                    // Create a new object copy to ensure Mongoose detects the change
                    village.materials.set(key, { ...value });
                }
                // Mark the materials Map as modified so Mongoose saves it
                village.markModified('materials');

                // Tokens were already lost proportionally to HP damage above
                // If there are any remaining tokens after proportional loss, remove them on level down
                const remainingTokens = village.currentTokens || 0;
                if (remainingTokens > 0) {
                    removedResources.push({ type: 'Tokens', amount: remainingTokens });
                    console.log(`[damageVillage] Removed remaining ${remainingTokens} tokens from "${villageName}" due to level down.`);
                }
                village.currentTokens = 0; // Reset to 0 on level down

                // Update status to damaged (HP is at max but status should reflect the level drop)
                updateVillageStatus(village);
                console.log(`[damageVillage] Village "${villageName}" leveled down to ${village.level}. All resources reset to 0.`);
            } else {
                console.log(`[damageVillage] Village "${villageName}" is already at the lowest level.`);
                // Update status even if at level 1
                updateVillageStatus(village);
            }
        } else {
            // Resource loss on every damage event (when HP > 0)
            // Formula: material_loss = max(1, floor(selected_material.current × damage_percentage))
            // Formula: token_loss = max(1, floor(current_tokens × damage_percentage))
            
            // Material loss: Select one random material with current > 0
            // First, ensure all materials have a 'current' property initialized
            for (const key in materials) {
                if (!materials[key] || typeof materials[key] !== 'object') {
                    materials[key] = { current: 0, required: {} };
                } else if (!('current' in materials[key])) {
                    materials[key].current = 0;
                }
            }
            
            const materialKeys = Object.keys(materials).filter(key => {
                const materialData = materials[key];
                const current = (materialData && typeof materialData === 'object' && 'current' in materialData) 
                    ? (materialData.current || 0) 
                    : 0;
                return current > 0;
            });
            
            if (materialKeys.length > 0) {
                // Select one random material from materials with current > 0
                const randomMaterial = materialKeys[Math.floor(Math.random() * materialKeys.length)];
                const materialData = materials[randomMaterial];
                const materialCurrent = materialData.current || 0;
                // material_loss = max(1, floor(material_current × damage_percentage))
                // The 25% cap is already applied in damagePercentage
                const removedAmount = Math.max(1, Math.floor(materialCurrent * damagePercentage));
                // Create a new object to ensure Mongoose detects the change
                const updatedMaterialData = { ...materialData, current: Math.max(0, materialCurrent - removedAmount) };
                village.materials.set(randomMaterial, updatedMaterialData);
                removedResources.push({ type: 'Material', name: randomMaterial, amount: removedAmount });
                console.log(`[damageVillage] Removed ${removedAmount} of "${randomMaterial}" from "${villageName}" (had ${materialCurrent}, damagePercentage: ${(damagePercentage * 100).toFixed(2)}%).`);
                // Mark the materials Map as modified so Mongoose saves it
                village.markModified('materials');
            } else {
                // If no materials have current > 0, no material is lost (but tokens may still be lost)
                console.log(`[damageVillage] No materials with current > 0 found for "${villageName}". Skipping material loss.`);
            }

            // Token loss was already calculated above (before the HP check)
            // This branch only handles material loss when HP > 0

            // Update status to damaged if HP < maxHealth
            updateVillageStatus(village);
        }

        // Update lastDamageTime when damage is applied
        village.lastDamageTime = new Date();
        
        // Save updated village
        await village.save();
        return { village, removedResources };
    } catch (error) {
        handleError(error, 'villageModule.js');
        console.error(`[damageVillage] Error for village "${villageName}":`, error.message);
        throw error;
    }
}

// ------------------- apply Village Damage -------------------
async function applyVillageDamage(villageName, monster, thread) {
    try {
        if (!villageName) throw new Error(`[applyVillageDamage] Invalid village name: "${villageName}".`);
        if (!monster || !monster.tier) {
            throw new Error(`[applyVillageDamage] Invalid monster data: ${JSON.stringify(monster)}.`);
        }

        // Determine damage based on monster tier (direct HP values)
        const tierDamageMap = {
            5: 8,
            6: 9,
            7: 11,
            8: 12,
            9: 14,
            10: 15
        };
        const damageAmount = tierDamageMap[monster.tier] || Math.ceil(monster.tier * 1.5); // Fallback for unexpected tiers
        console.log(`[applyVillageDamage] Calculated damage: ${damageAmount} HP (Monster Tier: ${monster.tier})`);

        // Apply damage to the village
        const { village: updatedVillage, removedResources } = await damageVillage(villageName, damageAmount);

        const tokensRemaining = updatedVillage.currentTokens || 0;

        // Format health as X/Y
        const maxHealth = updatedVillage.levelHealth instanceof Map 
            ? updatedVillage.levelHealth.get(updatedVillage.level.toString())
            : updatedVillage.levelHealth[updatedVillage.level.toString()] || 100;
        const healthBar = `❤️ **Health:** \`${updatedVillage.health}/${maxHealth}\``;

        // Determine if a level was lost (check by comparing level before/after or if HP was 0)
        // We can infer level drop if there are significantly more resources lost (all resources)
        const allResourcesLost = removedResources.some(r => r.type === 'Tokens' && r.amount === updatedVillage.currentTokens);
        const levelDropped = updatedVillage.health === maxHealth && updatedVillage.level > 0 && allResourcesLost;
        let levelMessage = '';
        
        // Always show resource loss (resources are lost on every damage event)
        const materialsLost = removedResources
            .filter(resource => resource.type === 'Material')
            .map(resource => `**${resource.name}:** ${resource.amount}`)
            .join('\n') || 'No materials lost.';
        
        const tokensLost = removedResources
            .filter(resource => resource.type === 'Tokens')
            .map(resource => `**Tokens Lost:** ${resource.amount}`)
            .join('\n') || '**Tokens Lost:** 0';

        if (levelDropped) {
            // Village dropped a level
            levelMessage = `\n⚠️ **OH NO! The village has lost a level!** It's now at **level ${updatedVillage.level}**.`;
        }

        const resourceLossMessage = `\n\n📦 **Materials Lost:**\n${materialsLost}\n\n${tokensLost}`;

        // Create an embed to report damage
        const failureEmbed = new EmbedBuilder()
            .setTitle(`❌ The Raid Has Failed!`)
            .setDescription(
                `The village **${villageName}** was overwhelmed by an attack from **${monster.name}** and has taken **${damageAmount} HP damage**!` +
                `\n\n${healthBar}${resourceLossMessage}\n🪙 **Tokens Remaining:** ${tokensRemaining}${levelMessage}`
            )
            .setImage(monster.image || 'https://pm1.aminoapps.com/6485/abe8c0c1f74bcc7eab0542eb1358f51be08c8beb_00.jpg')
            .setColor('#FF0000')
            .setFooter({ text: "Better luck next time!" });

        // Send embed to thread
        if (thread) {
            await thread.send({ embeds: [failureEmbed] });
            thread.setArchived(true);
        }
    } catch (error) {
        handleError(error, 'villageModule.js');
        console.error('[applyVillageDamage] Error applying village damage:', error);
    }
}

// ============================================================================
// ---- Exports ----
// ============================================================================
module.exports = { 
    Village,
    initializeVillages,
    damageVillage,
    applyVillageDamage,
    updateVillageHealth,
    getVillageInfo,
    calculateVillageStatus,
    updateVillageStatus,
    checkVillageStatus
};
