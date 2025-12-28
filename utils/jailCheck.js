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
    
    // The stored time is already in EST midnight
    const estReleaseDate = new Date(releaseTime);
    
    // Calculate the date when the character was jailed (3 days before release)
    const jailedDate = new Date(releaseTime - (3 * 24 * 60 * 60 * 1000));
    
    const jailEmbed = {
        title: '⛔ In Jail!',
        description: `**${character.name}** is currently serving time in jail and cannot perform this action.`,
        color: 0xFF0000,
        fields: [
            {
                name: '📅 Jailed Date',
                value: jailedDate.toLocaleDateString('en-US', { 
                    weekday: 'long',
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    timeZone: 'America/New_York'
                }),
                inline: false
            },
            {
                name: '📅 Release Date',
                value: `<t:${Math.floor(releaseTime / 1000)}:F>`,
                inline: false
            },
        ],
        thumbnail: {
            url: character.icon
        },
        image: {
            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
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
  