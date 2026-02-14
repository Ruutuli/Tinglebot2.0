// ============================================================================
// ------------------- Relic Utilities -------------------
// Handles relic outcome rolling and duplicate detection.
// ============================================================================

const { RELIC_OUTCOMES } = require('../data/relicOutcomes.js');

/**
 * Pick a weighted random relic outcome.
 * For unique relics, checks if one already exists (any relic with that rollOutcome); if so, returns as duplicate.
 * @param {Object} options
 * @param {Function} options.isArchived - async (relicName) => boolean - true if this unique relic is already discovered (any relic has this rollOutcome)
 * @returns {Promise<{ outcome: { name, description, weight, unique }, isDuplicate: boolean, duplicateOf?: ObjectId }>}
 */
async function rollRelicOutcome(options = {}) {
  const { isArchived = async () => false } = options;

  const totalWeight = RELIC_OUTCOMES.reduce((sum, e) => sum + (e.weight || 1), 0);
  let roll = Math.random() * totalWeight;

  for (const entry of RELIC_OUTCOMES) {
    const w = entry.weight || 1;
    roll -= w;
    if (roll <= 0) {
      if (entry.unique) {
        const alreadyArchived = await isArchived(entry.name);
        if (alreadyArchived) {
          return {
            outcome: entry,
            isDuplicate: true,
            duplicateOf: null, // Caller sets from archived relic lookup
          };
        }
      }
      return {
        outcome: entry,
        isDuplicate: false,
      };
    }
  }

  // Fallback to first entry
  const first = RELIC_OUTCOMES[0] || { name: "Unknown Relic", description: "An ancient artifact of unclear origin.", weight: 1, unique: false };
  return {
    outcome: first,
    isDuplicate: false,
  };
}

/**
 * Get all relic outcomes (for display or admin).
 */
function getRelicOutcomes() {
  return [...RELIC_OUTCOMES];
}

module.exports = {
  rollRelicOutcome,
  getRelicOutcomes,
};
