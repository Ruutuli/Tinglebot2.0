// ------------------- Village Module -------------------
const { Village } = require('../models/VillageModel');
const { EmbedBuilder } = require('discord.js');

// Placeholder for an in-memory storage of villages
const villages = {};

// ------------------- Function to Initialize a Village -------------------
function initializeVillage(villageName) {
    console.log(`[VILLAGE] Initializing village: ${villageName}`);
    if (!villages[villageName]) {
        villages[villageName] = {
            health: 100, // Default health value
            resources: 50, // Default resources value
        };
        console.log(`[VILLAGE] Village "${villageName}" initialized.`);
    } else {
        console.log(`[VILLAGE] Village "${villageName}" already exists.`);
    }
    return villages[villageName];
}

// ------------------- Function to Update Village Health -------------------
async function updateVillageHealth(villageName, healthChange) {
    console.log(`[VILLAGE] Updating health for village: ${villageName}, Change: ${healthChange}`);
    if (!villages[villageName]) {
        console.warn(`[VILLAGE] Village "${villageName}" does not exist. Initializing it now.`);
        initializeVillage(villageName);
    }
    villages[villageName].health = Math.max(villages[villageName].health + healthChange, 0); // Ensure health doesn't drop below 0
    console.log(`[VILLAGE] Village "${villageName}" health updated to ${villages[villageName].health}.`);
    return villages[villageName].health;
}

// ------------------- Function to Get Village Information -------------------
async function getVillageInfo(villageName) {
    console.log(`[VILLAGE] Retrieving information for village: ${villageName}`);
    if (!villages[villageName]) {
        console.warn(`[VILLAGE] Village "${villageName}" does not exist. Initializing it now.`);
        initializeVillage(villageName);
    }
    return villages[villageName];
}

// ------------------- Handle Village Damage -------------------
async function damageVillage(villageName, damageAmount) {
    try {
        const village = await Village.findOne({ name: { $regex: `^${villageName}$`, $options: 'i' } });
        if (!village) throw new Error(`Village "${villageName}" not found.`);

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
        console.error(`[damageVillage] Error:`, error);
        throw error;
    }
}


// ------------------- apply Village Damage -------------------
async function applyVillageDamage(villageName, monster, thread) {
    try {
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
        console.error('[applyVillageDamage] Error applying village damage:', error);
    }
}



// ------------------- Exported Functions -------------------
module.exports = {
    initializeVillage,
    updateVillageHealth,
    getVillageInfo,
    damageVillage,
    applyVillageDamage
};
