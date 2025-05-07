// ------------------- raidHandler.js -------------------
// This module handles the initiation of raids in the Discord bot.
// It stores battle progress, creates an embed message, manages threads for raid interactions,
// and schedules a timer to apply village damage after 15 minutes.
// -----------------------------------------------------------------------------------------

// ------------------- Discord.js Components -------------------
const { EmbedBuilder } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
// ------------------- Modules -------------------
const { applyVillageDamage } = require('../modules/villageModule');
const { storeBattleProgress } = require('../modules/raidCombatModule');
const { createRaidEmbed, createOrUpdateRaidThread, scheduleRaidTimer } = require('../modules/raidModule');

// ------------------- Database Models -------------------
const { monsterMapping } = require('../models/MonsterModel');

// ------------------- triggerRaid Function -------------------
// This function initiates a raid by storing battle progress, creating an embed message, 
// managing the associated thread, and scheduling a timer for village damage.
async function triggerRaid(character, monster, interaction, threadId, isBloodMoon) {
    // ------------------- Define Monster Hearts -------------------
    // Sets up the monster's health (hearts) for the raid.
    const monsterHearts = {
        max: monster.hearts,
        current: monster.hearts,
    };

    let battleId; // Variable to hold the battle identifier

    // ------------------- Store Battle Progress -------------------
    // Stores initial battle progress and generates a battle ID.
    try {
        battleId = await storeBattleProgress(
            character,
            monster,
            monster.tier,
            monsterHearts,
            isBloodMoon ? '🔴 Blood Moon Raid initiated!' : 'Raid initiated! Player turn next.'
        );
    } catch (error) {
        handleError(error, 'raidHandler.js');
        console.error(`[raidHandler.js]: triggerRaid: Failed to store battle progress: ${error.message}`);
        await interaction.followUp(`❌ **Failed to trigger the raid. Please try again later.**`);
        return;
    }

    // ------------------- Create Embed and Thread -------------------
    try {
        const embed = createRaidEmbed(character, monster, battleId, isBloodMoon);
        const thread = await createOrUpdateRaidThread(interaction, character, monster, embed, threadId, isBloodMoon);

        // ------------------- Schedule Timer for Village Damage -------------------
        const villageName = character.currentVillage || "Unknown Village";
        scheduleRaidTimer(villageName, monster, thread);

        return battleId;
    } catch (error) {
        handleError(error, 'raidHandler.js');
        console.error(`[raidHandler.js]: triggerRaid: Error creating raid: ${error.message}`);
        await interaction.followUp(`❌ **Failed to create the raid. Please try again later.**`);
        return null;
    }
}

// ------------------- Export the triggerRaid Function -------------------
module.exports = { triggerRaid };
