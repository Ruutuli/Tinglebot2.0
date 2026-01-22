// ============================================================================
// Special Weather Utilities
// Shared helpers for special weather gathering and period-based limits
// ============================================================================

const weatherService = require('../services/weatherService');
const { getCurrentPeriodBounds, normalizeVillageName } = weatherService;

/**
 * Characters may gather 1x per village per special-weather period (8am–7:59am EST/EDT).
 * Uses weatherService.getCurrentPeriodBounds for consistent EST/EDT period boundaries.
 *
 * @param {object} character - Character doc with specialWeatherUsage (Map of village -> Date)
 * @param {string} village - Village name (will be normalized)
 * @returns {boolean} true if the character can gather in that village this period
 */
function canUseSpecialWeather(character, village) {
  const key = normalizeVillageName(village);
  const raw = character.specialWeatherUsage?.get?.(key);
  if (!raw) return true;

  const lastUsage = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(lastUsage.getTime())) return true; // Invalid or legacy value: allow to avoid blocking.

  const { startUTC } = getCurrentPeriodBounds(new Date());
  // Last usage before current period started => can use again this period
  return lastUsage < startUTC;
}

module.exports = {
  canUseSpecialWeather,
  normalizeVillageName
};
