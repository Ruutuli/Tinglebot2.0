// ------------------- explorationTestingConfig.js -------------------
// Server-wide flag for exploration testing mode. When true, no persistence:
// hearts/stamina, items used/found, KO/debuff, map changes, grottos.
// Set EXPLORATION_TESTING_MODE=true in .env to enable.
// See README.md "Exploration Testing Mode (Remove After Testing)" for removal instructions.

const EXPLORATION_TESTING_MODE = process.env.EXPLORATION_TESTING_MODE === 'true';

module.exports = { EXPLORATION_TESTING_MODE };
