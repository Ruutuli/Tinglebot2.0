// ------------------- Standard Libraries -------------------
// Import third-party libraries.
const { v4: uuidv4 } = require('uuid');


// ------------------- Utility Functions -------------------
// Import helper functions for persistent storage.
const { retrieveBoostingRequestFromStorageByCharacter } = require('../utils/storage');


// ============================================================================
// ------------------- Boosting Utilities -------------------
// These functions provide helper methods for handling boost requests, including ID generation, category validation, formatting, and fetching active boosts.

// ------------------- Generate Boost Request ID -------------------
// Generates a clean boost request ID (an 8-character uppercase string).
function generateBoostRequestId() {
  return uuidv4().slice(0, 8).toUpperCase();
}


// ------------------- Check if Category is Exempt -------------------
// Determines if the provided boost category is exempt from job perk validation.
function isExemptBoostCategory(category) {
  const exemptCategories = ['Tokens', 'Exploring', 'Traveling', 'Mounts', 'Other'];
  return exemptCategories.includes(category);
}


// ------------------- Validate Boost Eligibility -------------------
// Validates if a character's job permits requesting a boost in the given category.
// Returns true if the category is exempt, or if the character's job includes the category perk; otherwise, false.
function validateBoostEligibility(character, category, getJobPerk) {
  if (isExemptBoostCategory(category)) return true;
  const jobPerk = getJobPerk(character.job);
  if (!jobPerk || !jobPerk.perks.includes(category.toUpperCase())) return false;
  return true;
}


// ------------------- Format Boost Category Name -------------------
// Formats a boost category name for display by capitalizing the first letter and lowercasing the remainder.
function formatBoostCategoryName(category) {
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}


// ------------------- Fetch Active Boost -------------------
// Asynchronously retrieves an active boost for a character based on character name and boost category.
// Returns the boost request if it exists, is fulfilled, and the category matches; otherwise, null.
async function fetchActiveBoost(characterName, category) {
  const request = retrieveBoostingRequestFromStorageByCharacter(characterName);
  if (!request) return null;
  if (request.status !== 'fulfilled') return null;
  if (request.category !== category) return null;
  return request;
}


// ============================================================================
// ------------------- Exports -------------------
// Export the boosting utility functions for use in other modules.
module.exports = {
  generateBoostRequestId,
  isExemptBoostCategory,
  validateBoostEligibility,
  formatBoostCategoryName,
  fetchActiveBoost
};
