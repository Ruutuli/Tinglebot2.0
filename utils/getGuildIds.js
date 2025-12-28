const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

/**
 * Get the guild ID from environment variables.
 * @returns {string[]} Array containing the guild ID.
 */
function getGuildIds() {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
        throw new Error('GUILD_ID environment variable is not set');
    }
    return [guildId];
}

module.exports = { getGuildIds };

/*
Notes:
- Added comments to explain the purpose of the function.
- Ensured the correct extraction of guild ID from environment variables.
*/
