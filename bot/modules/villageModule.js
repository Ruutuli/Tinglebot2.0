// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const mongoose = require('mongoose');
const { EmbedBuilder } = require('discord.js');

// ============================================================================
// ---- Utility Functions ----
// ============================================================================
const { handleError } = require('@/utils/globalErrorHandler');
const { capitalizeVillageName } = require('@/utils/stringUtils');

// ============================================================================
// ---- Imports ----
// ============================================================================
const { 
    Village,
    VILLAGE_CONFIG,
    DEFAULT_TOKEN_REQUIREMENTS
} = require('@/models/VillageModel');
const { VILLAGE_BANNERS } = require('@/database/db');
const ItemModel = require('@/models/ItemModel');

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
                // Sync config materials to existing village (add new, remove deprecated, update required)
                const existingMaterials = existingVillage.materials instanceof Map
                    ? Object.fromEntries(existingVillage.materials)
                    : existingVillage.materials || {};
                let materialsChanged = false;

                // Add new materials from config
                for (const [materialKey, configMaterial] of Object.entries(config.materials)) {
                    if (!existingMaterials[materialKey]) {
                        existingVillage.materials.set(materialKey, {
                            current: 0,
                            required: configMaterial.required
                        });
                        materialsChanged = true;
                        console.log(`[villageModule.js] 📦 Added material "${materialKey}" to ${name}`);
                    } else {
                        // Update required amounts if config changed
                        const existing = existingMaterials[materialKey];
                        const newRequired = configMaterial.required;
                        if (JSON.stringify(existing?.required) !== JSON.stringify(newRequired)) {
                            existingVillage.materials.set(materialKey, {
                                ...existing,
                                required: newRequired
                            });
                            materialsChanged = true;
                        }
                    }
                }

                // Remove materials no longer in config
                for (const materialKey of Object.keys(existingMaterials)) {
                    if (!config.materials[materialKey]) {
                        existingVillage.materials.delete(materialKey);
                        materialsChanged = true;
                        console.log(`[villageModule.js] 📦 Removed material "${materialKey}" from ${name}`);
                    }
                }

                if (materialsChanged) {
                    existingVillage.markModified('materials');
                    await existingVillage.save();
                    console.log(`[villageModule.js] ✅ Synced materials for ${name}`);
                } else {
                    console.log(`[villageModule.js] ℹ️ Village already exists: ${name}`);
                }
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

// ------------------- Function: isVillageToppedOffForLevel3 -------------------
// Returns true only when village is level 3 AND full HP, tokens at L3 cap, and all L3 materials at required amounts.
function isVillageToppedOffForLevel3(village) {
    if (village.level !== 3) return false;

    const maxHealth = village.levelHealth instanceof Map
        ? village.levelHealth.get('3')
        : village.levelHealth?.['3'];
    const level3MaxHealth = maxHealth !== undefined && maxHealth !== null ? maxHealth : 300;
    if (village.health < level3MaxHealth) return false;

    const l3TokenCap = DEFAULT_TOKEN_REQUIREMENTS[3] ?? 50000;
    if ((village.currentTokens ?? 0) < l3TokenCap) return false;

    const config = VILLAGE_CONFIG[village.name];
    if (!config?.materials) return true;
    const materialsMap = village.materials instanceof Map ? village.materials : new Map(Object.entries(village.materials || {}));
    for (const [key, configMaterial] of Object.entries(config.materials)) {
        const requiredL3 = configMaterial?.required?.[3];
        if (requiredL3 === undefined || requiredL3 === null) continue;
        const entry = materialsMap.get(key);
        const current = entry && typeof entry === 'object' && 'current' in entry ? (entry.current ?? 0) : 0;
        if (current < requiredL3) return false;
    }
    return true;
}

// ------------------- Function: getEffectiveVendingTier -------------------
// Level 3 perks apply only when topped off; otherwise effective tier is 2 at structural L3.
function getEffectiveVendingTier(village) {
    if (village.level < 3) return village.level;
    return isVillageToppedOffForLevel3(village) ? 3 : 2;
}

// ------------------- Function: getEffectiveVendingDiscount -------------------
function getEffectiveVendingDiscount(village) {
    const tier = getEffectiveVendingTier(village);
    return tier === 3 ? 20 : tier === 2 ? 10 : 0;
}

// ------------------- Function: getEffectiveRestLevel -------------------
function getEffectiveRestLevel(village) {
    return getEffectiveVendingTier(village);
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
// damageCause: optional string describing what caused the damage (e.g. "Monster: Stalkoblin", "Weather", "Moderator: Event")
async function damageVillage(villageName, damageAmount, damageCause = null) {
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
        const levelBefore = village.level;
        village.health = Math.max(0, village.health - damageAmount);
        const actualHPLost = healthBefore - village.health; // Actual HP lost (capped at current health)
        console.log(`[damageVillage] Updated health for village "${villageName}" to ${village.health}/${maxHealth} (damage: ${damageAmount} HP, actual HP lost: ${actualHPLost})`);

        const removedResources = [];
        let levelDropped = false;
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
                levelDropped = true;

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
            // Formula: material_loss = floor(material.current × damage_percentage) per material (proportional, no minimum)
            // All materials with stock take proportional damage (not just one random material)
            // Formula: token_loss = actual_HP_lost × TOKENS_PER_HP (handled above)
            
            // Material loss: Apply proportional damage to ALL materials with current > 0
            for (const key in materials) {
                if (!materials[key] || typeof materials[key] !== 'object') {
                    materials[key] = { current: 0, required: {} };
                } else if (!('current' in materials[key])) {
                    materials[key].current = 0;
                }
            }
            
            let anyMaterialLost = false;
            for (const materialKey of Object.keys(materials)) {
                const materialData = materials[materialKey];
                const materialCurrent = (materialData && typeof materialData === 'object' && 'current' in materialData) 
                    ? (materialData.current || 0) 
                    : 0;
                if (materialCurrent <= 0) continue;
                
                // material_loss = floor(material_current × damage_percentage) — proportional only, no minimum
                const removedAmount = Math.floor(materialCurrent * damagePercentage);
                if (removedAmount > 0) {
                    const newCurrent = Math.max(0, materialCurrent - removedAmount);
                    village.materials.set(materialKey, { ...materialData, current: newCurrent });
                    removedResources.push({ type: 'Material', name: materialKey, amount: removedAmount });
                    anyMaterialLost = true;
                    console.log(`[damageVillage] Removed ${removedAmount} of "${materialKey}" from "${villageName}" (had ${materialCurrent}, damagePercentage: ${(damagePercentage * 100).toFixed(2)}%).`);
                }
            }
            if (anyMaterialLost) {
                village.markModified('materials');
            } else {
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
        
        // ------------------- Send Village Damage Notification -------------------
        // Only send notification if actual damage occurred (actualHPLost > 0)
        if (actualHPLost > 0) {
            try {
                const { client } = require('../index.js');
                if (!client) {
                    console.error(`[damageVillage] ❌ Discord client not available for village damage notification`);
                } else {
                    // Get the village's specific townhall channel
                    const TOWNHALL_CHANNELS = {
                        Rudania: process.env.RUDANIA_TOWNHALL,
                        Inariko: process.env.INARIKO_TOWNHALL,
                        Vhintl: process.env.VHINTL_TOWNHALL,
                    };
                    const villageChannelId = TOWNHALL_CHANNELS[village.name] || '1391812848099004578'; // Fallback to test channel
                    console.log(`[damageVillage] 📢 Attempting to send village damage notification to ${village.name} channel ${villageChannelId}`);
                    
                    const channel = await client.channels.fetch(villageChannelId);
                    if (!channel) {
                        console.error(`[damageVillage] ❌ Could not find channel ${villageChannelId} for village damage notification`);
                    } else {
                        // Prepare resource loss details with emojis
                        const materialsLostPromises = removedResources
                            .filter(r => r.type === 'Material')
                            .map(async (r) => {
                                const item = await ItemModel.findOne({ itemName: { $regex: `^${r.name}$`, $options: 'i' } });
                                const emoji = item?.emoji || '📦';
                                return `${emoji} **${r.name}:** ${r.amount.toLocaleString()}`;
                            });
                        const materialsLostLines = await Promise.all(materialsLostPromises);
                        const materialsLost = materialsLostLines.length > 0 
                            ? materialsLostLines.join('\n') 
                            : 'No materials lost';
                        
                        const tokensLost = removedResources
                            .filter(r => r.type === 'Tokens')
                            .reduce((sum, r) => sum + r.amount, 0);
                        
                        const currentTokens = village.currentTokens || 0;
                        const healthAfter = village.health;
                        const currentMaxHealth = village.levelHealth instanceof Map 
                            ? village.levelHealth.get(village.level.toString()) 
                            : village.levelHealth[village.level.toString()] || 100;
                        
                        // Get village color and emoji from config
                        const villageConfig = VILLAGE_CONFIG[village.name] || {};
                        const villageColor = village.color || villageConfig.color || '#FF4444';
                        const villageEmoji = village.emoji || villageConfig.emoji || '🏘️';
                        
                        // Convert hex color to integer for Discord embed
                        const embedColor = parseInt(villageColor.replace('#', ''), 16) || 0xFF4444;
                        
                        // Village-specific banner images
                        const villageBannerImage = VILLAGE_BANNERS[village.name] || 'https://storage.googleapis.com/tinglebot/Graphics/border.png';
                        
                        // Helper function to create progress bar
                        const createProgressBar = (current, max, length = 10) => {
                            if (max <= 0) return `\`${'▱'.repeat(length)}\` 0/0`;
                            const progress = Math.max(0, Math.min(length, Math.round((current / max) * length)));
                            return `\`${'▰'.repeat(progress)}${'▱'.repeat(length - progress)}\``;
                        };
                        
                        // Format health with progress bar (showing "After" state)
                        const healthBar = createProgressBar(healthAfter, currentMaxHealth);
                        const healthValue = `> **Before:** \`${healthBefore.toLocaleString()}/${maxHealth.toLocaleString()}\`\n> ${healthBar} **After:** \`${healthAfter.toLocaleString()}/${currentMaxHealth.toLocaleString()}\`\n> **Lost:** \`${actualHPLost.toLocaleString()} HP\``;
                        
                        // Format tokens with progress bar (assuming a reasonable max for display)
                        // Using a max based on level or a default large value for display purposes
                        const tokenMax = Math.max(currentTokens, 50000); // Use current tokens as min, or 50k if higher
                        const tokenBar = createProgressBar(currentTokens, tokenMax);
                        const tokenValue = `> ${tokenBar} **${currentTokens.toLocaleString()}**\n> **Lost:** \`${tokensLost.toLocaleString()}\``;
                        
                        // Build embed
                        const damageEmbed = new EmbedBuilder()
                            .setTitle(`${villageEmoji} ⚠️ Village Damage Report`)
                            .setDescription(`**${village.name}** has taken damage!\n\n[View Villages Dashboard](https://tinglebot.xyz/models/villages)`)
                            .setColor(embedColor)
                            .addFields(
                                ...(damageCause ? [{
                                    name: '__⚔️ Damage Source__',
                                    value: `> ${damageCause}`,
                                    inline: false
                                }] : []),
                                {
                                    name: '__❤️ Health__',
                                    value: healthValue,
                                    inline: true
                                },
                                {
                                    name: '__📊 Village Level__',
                                    value: `> **Level:** ${village.level}${levelDropped ? ' ⬇️ (Decreased!)' : ''}`,
                                    inline: true
                                },
                                {
                                    name: '__🪙 Tokens__',
                                    value: tokenValue,
                                    inline: true
                                }
                            )
                            .setImage(villageBannerImage)
                            .setTimestamp();
                        
                        // Add materials lost field if any materials were lost
                        if (materialsLost !== 'No materials lost') {
                            // Wrap each material line in quote blocks
                            const materialsLostQuoted = materialsLostLines.map(line => `> ${line}`).join('\n');
                            damageEmbed.addFields({
                                name: '__📦 Materials Lost__',
                                value: materialsLostQuoted,
                                inline: false
                            });
                        }
                        
                        // Add level drop warning if applicable
                        if (levelDropped) {
                            damageEmbed.addFields({
                                name: '⚠️ Critical Damage',
                                value: `The village has lost a level and dropped to **level ${village.level}**! All remaining resources have been lost.`,
                                inline: false
                            });
                        }
                        
                        await channel.send({ embeds: [damageEmbed] });
                        console.log(`[damageVillage] ✅ Successfully sent village damage notification to ${village.name} channel ${villageChannelId}`);
                    }
                }
            } catch (notificationError) {
                // Don't fail village damage if notification fails, but log the error
                console.error(`[damageVillage] ❌ Error sending village damage notification:`, notificationError.message);
                console.error(`[damageVillage] Stack trace:`, notificationError.stack);
            }
        }
        
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

        const damageCause = `Monster: **${monster.name}** (Failed raid - Tier ${monster.tier})`;
        // Apply damage to the village
        const { village: updatedVillage, removedResources } = await damageVillage(villageName, damageAmount, damageCause);

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

        // Create an embed to report damage
        const failureEmbed = new EmbedBuilder()
            .setTitle(`❌ The Raid Has Failed!`)
            .setDescription(
                `The village **${villageName}** was overwhelmed by an attack from **${monster.name}** and has taken **${damageAmount} HP damage**!`
            )
            .setColor('#FF0000')
            .addFields(
                {
                    name: '❤️ Village Health',
                    value: `\`${updatedVillage.health}/${maxHealth}\``,
                    inline: true
                },
                {
                    name: '💔 Damage Taken',
                    value: `\`${damageAmount} HP\``,
                    inline: true
                },
                {
                    name: '📦 Materials Lost',
                    value: materialsLost || 'No materials lost.',
                    inline: false
                },
                {
                    name: '🪙 Tokens',
                    value: `${removedResources.filter(r => r.type === 'Tokens').map(r => `Lost: ${r.amount}`).join('\n') || 'Lost: 0'}\n**Remaining:** ${tokensRemaining}`,
                    inline: false
                }
            )
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
            .setFooter({ text: "Better luck next time!" })
            .setTimestamp();

        // Add monster image as thumbnail if available
        if (monster.image && monster.image !== 'No Image') {
            failureEmbed.setThumbnail(monster.image);
        }

        // Add level drop message as a field if applicable
        if (levelDropped) {
            failureEmbed.addFields({
                name: '⚠️ Village Level Decreased',
                value: `The village has lost a level and is now at **level ${updatedVillage.level}**.`,
                inline: false
            });
        }

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
    checkVillageStatus,
    getEffectiveVendingTier,
    getEffectiveVendingDiscount,
    getEffectiveRestLevel
};
