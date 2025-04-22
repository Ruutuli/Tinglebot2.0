require('dotenv').config();

/**
 * Get the list of guild IDs from environment variables.
 * @returns {string[]} Array of guild IDs.
 */
function getGuildIds() {
    return process.env.GUILD_IDS.split(',').map(id => id.trim());
}

module.exports = { getGuildIds };

/*
Notes:
- Added comments to explain the purpose of the function.
- Ensured the correct extraction of guild IDs from environment variables.
*/
