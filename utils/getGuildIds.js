const dotenv = require('dotenv');

// Load environment variables based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });

/**
 * Get the list of guild IDs from environment variables.
 * @returns {string[]} Array of guild IDs.
 */
function getGuildIds() {
    if (env === 'development') {
        return [process.env.TEST_GUILD_ID];
    } else {
        return [process.env.PROD_GUILD_ID];
    }
}

module.exports = { getGuildIds };

/*
Notes:
- Added comments to explain the purpose of the function.
- Ensured the correct extraction of guild IDs from environment variables.
*/
