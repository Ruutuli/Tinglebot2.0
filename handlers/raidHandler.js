// ------------------- raidHandler.js -------------------
// This module handles the initiation of raids in the Discord bot.
// It stores battle progress, creates an embed message, manages threads for raid interactions,
// and schedules a timer to apply village damage after 10 minutes.
// -----------------------------------------------------------------------------------------

// ------------------- Discord.js Components -------------------
const { EmbedBuilder } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
// ------------------- Modules -------------------
const { applyVillageDamage } = require('../modules/villageModule');
const { storeBattleProgress } = require('../modules/combatModule');

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

    // ------------------- Create Embed Message -------------------
    // Builds an embed message to display raid information.
    const monsterData = monsterMapping[monster.nameMapping] || {};
    const monsterImage = monsterData.image || monster.image;

    const embed = new EmbedBuilder()
        .setTitle(isBloodMoon ? `🔴 **Blood Moon Raid initiated!**` : `🛡️ **Raid initiated!**`)
        .setDescription(
            `Use \`/raid id:${battleId}\` to join or continue the raid!\n` +
            `Use \`/item\` to heal during the raid!`
        )
        .addFields(
            { name: `__Monster Hearts__`, value: `💙 ${monsterHearts.current}/${monsterHearts.max}`, inline: false },
            { name: `__${character.name || 'Unknown Adventurer'} Hearts__`, value: `❤️ ${character.currentHearts}/${character.maxHearts}`, inline: false },
            { name: `__Battle ID__`, value: `\`\`\`${battleId}\`\`\``, inline: false }
        )
        .setAuthor({
            name: character.name || 'Unknown Adventurer',
            iconURL: character.icon || 'https://via.placeholder.com/100',
        })
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
        .setFooter({ text: `You have 10 minutes to complete this raid!` })
        .setColor(isBloodMoon ? '#FF4500' : '#FF0000');

    if (monsterImage && monsterImage.startsWith('http')) {
        embed.setThumbnail(monsterImage);
    }

    // ------------------- Create or Update Thread -------------------
    // Handles thread creation for the raid if not provided, or updates the existing thread.
    let thread;
    try {
        if (!threadId) {
            const emoji = isBloodMoon ? '🔴' : '🛡️';
            const threadName = `${emoji} ${character.currentVillage || 'Unknown Village'} - ${monster.name} (Tier ${monster.tier})`;
        
            // Edit the initial interaction reply with the embed message.
            await interaction.editReply({ embeds: [embed] });
        
            // Start a new thread from the reply message.
            thread = await interaction.fetchReply().then((message) =>
                message.startThread({
                    name: threadName,
                    autoArchiveDuration: 1440,
                    reason: `Raid initiated for ${character.name} against ${monster.name}`,
                })
            );
        
            threadId = thread.id; // Update threadId with the new thread's ID
        
            // Build the role mentions based on village name
            const safeVillageName = (character.currentVillage || "UnknownVillage").replace(/\s+/g, '');
            const residentRole = `@${safeVillageName} resident`;
            const visitorRole = `@visiting:${safeVillageName}`;
        
            // Send an initial ping message mentioning visitors and residents
            await thread.send(`👋 <@${interaction.user.id}> has initiated a raid against **${monster.name} (Tier ${monster.tier})**!\n\n${residentRole} ${visitorRole} — come help defend your home!`);
        }
         else {
            // If a thread ID is provided, fetch the existing thread.
            thread = interaction.guild.channels.cache.get(threadId);

            if (!thread) {
                console.error(`[raidHandler.js]: triggerRaid: Thread not found for ID: ${threadId}`);
                await interaction.followUp(`❌ **Unable to locate the raid thread. Please try again later.**`);
                return;
            }

            // Send the embed message to the existing thread.
            await thread.send({ embeds: [embed] });
        }
    } catch (error) {
    handleError(error, 'raidHandler.js');

        console.error(`[raidHandler.js]: triggerRaid: Error creating/updating thread: ${error.message}`);
        await interaction.followUp(`❌ **Unable to create or update a thread for the raid. Please try again later.**`);
        return;
    }

    // ------------------- Schedule Timer for Village Damage -------------------
    // Sets a timer for 10 minutes to apply damage to the village if the raid is not completed.
    const timerDuration = 10 * 60 * 1000; // Timer duration set to 10 minutes
    const villageName = character.currentVillage || "Unknown Village"; // Fallback for village name

    setTimeout(async () => {
        try {
            await applyVillageDamage(villageName, monster, thread);
        } catch (error) {
    handleError(error, 'raidHandler.js');

            console.error(`[raidHandler.js]: Timer: Error during applyVillageDamage execution: ${error.message}`);
        }
    }, timerDuration);

    // ------------------- Return Battle ID -------------------
    // Returns the generated battle ID to the caller.
    return battleId;
}

// ------------------- Export the triggerRaid Function -------------------
module.exports = { triggerRaid };
