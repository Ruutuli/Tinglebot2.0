// utils/jailCheck.js
// ============================================================================
// Jail Management Utilities
// ============================================================================
// Centralized jail system to prevent race conditions and ensure consistency

const logger = require('./logger');
const { EmbedBuilder } = require('discord.js');

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_JAIL_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats jail time left into a readable string (days, hours, minutes)
 */
function formatJailTimeLeftDaysHours(timeLeft) {
    if (timeLeft <= 0) return '0 minutes';
    
    const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
    const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
    
    if (days > 0) {
        return `${days}d ${hours}h`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

/**
 * Validates jail field consistency
 * Returns true if valid, false if inconsistencies found (and fixes them)
 */
async function validateJailFields(character) {
    // If inJail is false, ensure all jail fields are cleared
    if (!character.inJail) {
        if (character.jailReleaseTime || character.jailStartTime || character.jailDurationMs || character.jailBoostSource) {
            character.jailReleaseTime = null;
            character.jailStartTime = null;
            character.jailDurationMs = null;
            character.jailBoostSource = null;
            await character.save();
            return false;
        }
        return true;
    }
    
    // If inJail is true, jailReleaseTime must exist and be valid
    if (!character.jailReleaseTime) {
        logger.warn('JAIL', `Character ${character.name} has inJail=true but no jailReleaseTime. Fixing...`);
        character.inJail = false;
        character.jailStartTime = null;
        character.jailDurationMs = null;
        character.jailBoostSource = null;
        await character.save();
        return false;
    }
    
    // Validate jailReleaseTime is a valid date
    const releaseTime = new Date(character.jailReleaseTime);
    if (isNaN(releaseTime.getTime())) {
        logger.warn('JAIL', `Character ${character.name} has invalid jailReleaseTime. Fixing...`);
        character.inJail = false;
        character.jailReleaseTime = null;
        character.jailStartTime = null;
        character.jailDurationMs = null;
        character.jailBoostSource = null;
        await character.save();
        return false;
    }
    
    return true;
}

/**
 * Calculates the jailed date from available fields
 */
function getJailedDate(character) {
    if (!character.jailReleaseTime) {
        return null;
    }
    
    const releaseTime = new Date(character.jailReleaseTime).getTime();
    
    if (character.jailStartTime) {
        return new Date(character.jailStartTime);
    } else if (character.jailDurationMs) {
        return new Date(releaseTime - character.jailDurationMs);
    } else {
        // Fallback to default duration
        return new Date(releaseTime - DEFAULT_JAIL_DURATION_MS);
    }
}

// ============================================================================
// Core Jail Functions
// ============================================================================

/**
 * Checks jail status and updates character if jail time has expired
 * Returns status object
 * @param {Object} character - Character object
 * @returns {Promise<Object>} Status object with isInJail, timeLeft, jailedDate
 */
async function checkJailStatus(character) {
    // If not in jail, return early
    if (!character.inJail) {
        return { isInJail: false, timeLeft: 0, jailedDate: null };
    }
    
    // Validate and fix inconsistencies
    const isValid = await validateJailFields(character);
    if (!isValid || !character.inJail) {
        return { isInJail: false, timeLeft: 0, jailedDate: null };
    }
    
    const now = Date.now();
    const releaseTime = new Date(character.jailReleaseTime).getTime();
    const timeLeft = releaseTime - now;
    
    // If jail time has expired, release the character
    if (timeLeft <= 0) {
        await releaseFromJail(character);
        return { isInJail: false, timeLeft: 0, jailedDate: null };
    }
    
    const jailedDate = getJailedDate(character);
    
    return {
        isInJail: true,
        timeLeft,
        jailedDate
    };
}

/**
 * Checks if a character is in jail and handles all restrictions.
 * Returns true if character is in jail (to stop command execution), false otherwise.
 * @param {Object} interaction - Discord interaction object
 * @param {Object} character - Character object
 * @returns {Promise<boolean>} True if in jail (blocks command), false otherwise
 */
async function enforceJail(interaction, character) {
    if (!character.inJail) {
        return false;
    }

    // Validate and fix inconsistencies first
    const isValid = await validateJailFields(character);
    if (!isValid || !character.inJail) {
        return false;
    }

    const now = Date.now();
    const releaseTime = new Date(character.jailReleaseTime).getTime();

    // Check if jail time is up
    if (now >= releaseTime) {
        logger.info('JAIL', `🔄 Jail time completed for ${character.name}, releasing character`);
        await releaseFromJail(character);
        return false;
    }

    // Calculate jailed date using stored fields
    const jailedDate = getJailedDate(character);
    const timeLeft = releaseTime - now;

    // Create detailed error message
    const jailEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('⛔ In Jail!')
        .setDescription(`**${character.name}** is currently serving time in jail and cannot perform this action.`)
        .addFields(
            {
                name: '📅 Jailed Date',
                value: jailedDate ? jailedDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'America/New_York'
                }) : 'Unknown',
                inline: false
            },
            {
                name: '📅 Release Date',
                value: `<t:${Math.floor(releaseTime / 1000)}:F>`,
                inline: false
            },
            {
                name: '⏰ Time Remaining',
                value: formatJailTimeLeftDaysHours(timeLeft),
                inline: false
            }
        )
        .setThumbnail(character.icon || null)
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
        .setFooter({
            text: 'You will be automatically released when your time is up.',
            icon_url: character.icon || undefined
        })
        .setTimestamp();

    try {
        await interaction.editReply({
            embeds: [jailEmbed],
            flags: [4096]
        });
    } catch (error) {
        logger.error('JAIL', `Error sending jail embed for ${character.name}`, error);
    }

    return true;
}

/**
 * Checks if a character is in jail without sending a message.
 * Useful for internal checks where you don't want to notify the user.
 * This is a synchronous check that doesn't modify the character.
 * @param {Object} character - Character object
 * @returns {boolean} True if in jail, false otherwise
 */
function isInJail(character) {
    if (!character.inJail) {
        return false;
    }

    // Check if jail time is up (synchronous check only)
    if (character.jailReleaseTime) {
        const releaseTime = new Date(character.jailReleaseTime).getTime();
        if (!isNaN(releaseTime) && Date.now() >= releaseTime) {
            // Time is up, but don't modify character here (use async function for that)
            return false;
        }
    }

    return true;
}

/**
 * Releases a character from jail and clears all jail-related fields
 * @param {Object} character - Character object
 * @returns {Promise<void>}
 */
async function releaseFromJail(character) {
    try {
        character.inJail = false;
        character.failedStealAttempts = 0; // Reset counter
        character.jailReleaseTime = null;
        character.jailStartTime = null;
        character.jailDurationMs = null;
        character.jailBoostSource = null;
        await character.save();
        logger.info('JAIL', `Released ${character.name} from jail`);
    } catch (error) {
        logger.error('JAIL', `Error releasing ${character.name} from jail`, error);
        throw error;
    }
}

/**
 * Sends a character to jail
 * Handles Priest boost (Merciful Sentence) and calculates release time at midnight EST
 * @param {Object} character - Character object
 * @returns {Promise<Object>} Result object with success, releaseTime, timeLeft
 */
async function sendToJail(character) {
    try {
        // Mod characters are immune to jail
        if (character.isModCharacter) {
            logger.info('JAIL', `👑 Mod character ${character.name} is immune to jail.`);
            return {
                success: false,
                message: `👑 ${character.name} is a mod character and cannot be sent to jail.`
            };
        }

        // Calculate release time: 3 days from now at midnight EST
        let jailDays = 3;

        // ============================================================================
        // ------------------- Apply Priest Boost (Merciful Sentence) -------------------
        // ============================================================================
        if (character.boostedBy) {
            const { fetchCharacterByName } = require('../database/db');
            const boosterChar = await fetchCharacterByName(character.boostedBy);

            if (boosterChar && boosterChar.job === 'Priest') {
                jailDays = Math.ceil(jailDays / 2); // Halve jail time (3 → 2 days, rounded up)
                logger.info('JAIL', `✨ Priest boost - Merciful Sentence (jail time reduced to ${jailDays} days for ${character.name})`);
                character.jailBoostSource = boosterChar.name || boosterChar.characterName || boosterChar._id?.toString() || 'Priest';
            } else {
                character.jailBoostSource = null;
            }
        } else {
            character.jailBoostSource = null;
        }

        const now = new Date();
        // Get EST date (UTC-5) for date calculation
        const estNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
        const releaseDateEST = new Date(estNow.getUTCFullYear(), estNow.getUTCMonth(), estNow.getUTCDate() + jailDays, 0, 0, 0, 0);
        const jailDurationMs = jailDays * 24 * 60 * 60 * 1000;
        const jailStartEST = new Date(releaseDateEST.getTime() - jailDurationMs);

        // Store the EST midnight time directly
        character.inJail = true;
        character.jailReleaseTime = releaseDateEST;
        character.jailStartTime = jailStartEST;
        character.jailDurationMs = jailDurationMs;
        character.failedStealAttempts = 0; // Reset counter
        await character.save();

        // Schedule Agenda job for jail release
        try {
            const { scheduleJailRelease } = require('../scheduler/scheduler');
            await scheduleJailRelease(character);
        } catch (agendaError) {
            // Log but don't fail - the daily cron check will still catch it as fallback
            logger.warn('JAIL', `Failed to schedule Agenda job for ${character.name}, will use fallback: ${agendaError.message}`);
        }

        logger.info('JAIL', `Sent ${character.name} to jail until ${releaseDateEST.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);

        return {
            success: true,
            releaseTime: character.jailReleaseTime,
            timeLeft: character.jailReleaseTime.getTime() - Date.now()
        };
    } catch (error) {
        logger.error('JAIL', `Error sending ${character.name} to jail`, error);
        throw error;
    }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
    enforceJail,
    isInJail,
    checkJailStatus,
    sendToJail,
    releaseFromJail,
    formatJailTimeLeftDaysHours,
    DEFAULT_JAIL_DURATION_MS
};
