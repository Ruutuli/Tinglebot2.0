// utils/jailCheck.js

/**
 * Checks if a character is in jail and handles all restrictions.
 * Returns true if character is in jail (to stop command execution), false otherwise.
 */
async function enforceJail(interaction, character) {
    if (!character.inJail) {
        return false;
    }

    // Check if jail time is up
    if (character.jailReleaseTime && Date.now() >= character.jailReleaseTime.getTime()) {
        console.log('[jailCheck.js]: 🔄 Jail time completed, releasing character');
        character.inJail = false;
        character.jailReleaseTime = null;
        await character.save();
        return false;
    }

    // Create detailed error message
    const releaseTime = character.jailReleaseTime.getTime();
    
    // Calculate midnight EST release time
    const now = new Date();
    const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const timeLeft = releaseTime - now;
    const midnightEST = new Date(estNow.getFullYear(), estNow.getMonth(), estNow.getDate() + Math.ceil(timeLeft / (24 * 60 * 60 * 1000)), 0, 0, 0, 0);
    
    const jailEmbed = {
        title: '⛔ In Jail!',
        description: `**${character.name}** is currently serving time in jail and cannot perform this action.`,
        color: 0xFF0000,
        fields: [
            {
                name: '⏰ Time Remaining',
                value: `<t:${Math.floor(releaseTime / 1000)}:R>`,
                inline: false
            },
            {
                name: '🕒 Release Time',
                value: `<t:${Math.floor(midnightEST.getTime() / 1000)}:F> (Midnight EST)`,
                inline: false
            },
        ],
        thumbnail: {
            url: character.icon
        },
        image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
        },
        footer: {
            text: 'You will be automatically released when your time is up.',
            icon_url: character.icon
        }
    };

    await interaction.editReply({
        embeds: [jailEmbed],
        flags: [4096]
    });

    return true;
}

/**
 * Checks if a character is in jail without sending a message.
 * Useful for internal checks where you don't want to notify the user.
 */
function isInJail(character) {
    if (!character.inJail) {
        return false;
    }

    // Check if jail time is up
    if (character.jailReleaseTime && Date.now() >= character.jailReleaseTime.getTime()) {
        character.inJail = false;
        character.jailReleaseTime = null;
        character.save().catch(console.error);
        return false;
    }

    return true;
}

module.exports = { enforceJail, isInJail };
  