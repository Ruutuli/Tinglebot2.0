const { checkAndCreateEncounter } = require('../modules/randomMountEncounterModule');
const { handleError } = require('../utils/globalErrorHandler');
const { createMountEncounterEmbed } = require('../embeds/embeds');

// Track message activity and create random encounters
async function handleMessage(message) {
    try {
        // Ignore bot messages
        if (message.author.bot) return;

        // Check for random mount encounter
        const encounter = await checkAndCreateEncounter(message.channel.id);
        
        if (encounter) {
            // Create and send the encounter embed
            const embed = createMountEncounterEmbed(encounter);
            const encounterMessage = await message.channel.send({
                content: encounter.isMonthly ? 
                    '🎉 **Monthly Mount Encounter!** A special mount has appeared!' :
                    '🐎 **Random Mount Encounter!** A mount has appeared!',
                embeds: [embed]
            });

            // Add reaction for users to join
            await encounterMessage.react('🎲');
        }
    } catch (error) {
        handleError(error, 'messageHandler.js');
        console.error('[messageHandler]: Error handling message:', error);
    }
}

module.exports = {
    handleMessage
}; 