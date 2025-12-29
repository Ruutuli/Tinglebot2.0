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

// ------------------- Handle Village Damage -------------------
async function damageVillage(villageName, damageAmount) {
    try {
        const village = await Village.findOne({ name: { $regex: `^${villageName}$`, $options: 'i' } });
        if (!village) {
            throw new Error(`[damageVillage] Village "${villageName}" not found. Ensure the name is correct.`);
        }

        const maxHealth = village.levelHealth[village.level.toString()] || 100; // Maximum health for the current level
        const percentageDamage = Math.min(damageAmount / maxHealth, 1); // Cap percentage at 100%

        // Apply damage to village health
        village.health = Math.max(0, village.health - damageAmount);
        console.log(`[damageVillage] Updated health for village "${villageName}" to ${village.health}`);

        const removedResources = [];
        const materials = village.materials instanceof Map ? Object.fromEntries(village.materials) : village.materials;

        if (village.health === 0) {
            // Level down logic
            console.log(`[damageVillage] Village "${villageName}" health reached 0. Decreasing level.`);
            if (village.level > 1) {
                village.level -= 1;

                // Reset health for the new level
                village.health = village.levelHealth[village.level.toString()] || 100;

                // Set all tokens and materials to 0
                for (const material in materials) {
                    const removedAmount = materials[material].current; // Remove everything
                    materials[material].current = 0;
                    if (removedAmount > 0) {
                        removedResources.push({ type: 'Material', name: material, amount: removedAmount });
                    }
                }

                const removedTokens = village.currentTokens; // Remove all tokens
                village.currentTokens = 0;
                if (removedTokens > 0) {
                    removedResources.push({ type: 'Tokens', amount: removedTokens });
                }

                console.log(`[damageVillage] Village "${villageName}" leveled down to ${village.level}. All resources reset to 0.`);
            } else {
                console.log(`[damageVillage] Village "${villageName}" is already at the lowest level.`);
            }
        } else {
            // Calculate resource removal based on damage percentage
            const materialKeys = Object.keys(materials).filter(key => materials[key].current > 0);
            if (materialKeys.length > 0) {
                const randomMaterial = materialKeys[Math.floor(Math.random() * materialKeys.length)];
                const removedAmount = Math.max(1, Math.ceil(materials[randomMaterial].current * percentageDamage)); // Ensure at least 1 is removed
                materials[randomMaterial].current -= removedAmount;
                removedResources.push({ type: 'Material', name: randomMaterial, amount: removedAmount });
                console.log(`[damageVillage] Removed ${removedAmount} of "${randomMaterial}" from "${villageName}".`);
            }

            if (village.currentTokens > 0) {
                const removedTokens = Math.max(1, Math.ceil(village.currentTokens * percentageDamage)); // Ensure at least 1 token is removed
                village.currentTokens -= removedTokens;
                removedResources.push({ type: 'Tokens', amount: removedTokens });
                console.log(`[damageVillage] Removed ${removedTokens} tokens from "${villageName}".`);
            }
        }

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

        // Determine damage based on monster tier
        const damageAmount = Math.ceil(monster.tier * 1.5); // Damage based on monster tier
        console.log(`[applyVillageDamage] Calculated damage: ${damageAmount} (Monster Tier: ${monster.tier})`);

        // Apply damage to the village
        const { village: updatedVillage, removedResources } = await damageVillage(villageName, damageAmount);

        const tokensRemaining = updatedVillage.currentTokens || 0;

        // Generate a report of resources lost
        const materialsLost = removedResources
            .filter(resource => resource.type === 'Material')
            .map(resource => `**${resource.name}:** ${resource.amount}`)
            .join('\n') || 'No materials lost.';
        
        const tokensLost = removedResources
            .filter(resource => resource.type === 'Tokens')
            .map(resource => `**Tokens Lost:** ${resource.amount}`)
            .join('\n') || '**Tokens Lost:** 0';

        // Format health as X/Y
        const maxHealth = updatedVillage.levelHealth[updatedVillage.level.toString()] || 100;
        const healthBar = `❤️ **Health:** \`${updatedVillage.health}/${maxHealth}\``;

        // Determine if a level was lost
        let levelMessage = '';
        if (updatedVillage.level < monster.level) {
            levelMessage = `\n⚠️ **OH NO! The village has lost a level!** It's now at **level ${updatedVillage.level}**.`;
        }

        // Create an embed to report damage
        const failureEmbed = new EmbedBuilder()
            .setTitle(`❌ The Raid Has Failed!`)
            .setDescription(
                `The village **${villageName}** was overwhelmed by an attack from **${monster.name}** and has taken **${damageAmount} damage**!` +
                `\n\n${healthBar}\n\n📦 **Materials Lost:**\n${materialsLost}\n\n${tokensLost}` +
                `\n🪙 **Tokens Remaining:** ${tokensRemaining}\n\n${levelMessage}`
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
    getVillageInfo
};
