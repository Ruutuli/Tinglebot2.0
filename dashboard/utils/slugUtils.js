// ============================================================================
// ------------------- Slug Utilities -------------------
// Functions for generating and normalizing URL slugs from character names
// ============================================================================

/**
 * Create a URL slug from a character name
 * @param {string} name - Character name
 * @returns {string} - URL slug
 */
function createCharacterSlug(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Normalize a slug for comparison
 * @param {string} slug - Slug to normalize
 * @returns {string} - Normalized slug
 */
function normalizeSlug(slug) {
  if (!slug || typeof slug !== 'string') return '';
  return slug.toLowerCase().trim();
}

/**
 * Check if a slug matches a character name
 * @param {string} slug - URL slug
 * @param {string} name - Character name
 * @returns {boolean} - True if slug matches name
 */
function slugMatchesName(slug, name) {
  const normalizedSlug = normalizeSlug(slug);
  const nameSlug = createCharacterSlug(name);
  return nameSlug === normalizedSlug;
}

module.exports = {
  createCharacterSlug,
  normalizeSlug,
  slugMatchesName
};
