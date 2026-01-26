/**
 * Quest tracking utility functions
 * Used by UserModel for quest completion tracking
 */

/**
 * Count unique quest completions from an array of completion objects.
 * A completion is considered unique based on its questId.
 * If questId is missing, it may be counted separately (handles legacy data).
 * 
 * @param {Array} completions - Array of quest completion objects
 * @returns {number} - Number of unique quest completions
 */
function countUniqueQuestCompletions(completions) {
  if (!Array.isArray(completions) || completions.length === 0) {
    return 0;
  }

  // Track unique quest IDs
  const uniqueQuestIds = new Set();
  let countWithoutId = 0;

  for (const completion of completions) {
    if (completion.questId && completion.questId.trim() !== '') {
      // Count by unique questId
      uniqueQuestIds.add(completion.questId);
    } else {
      // If no questId, count separately (handles legacy or incomplete data)
      // This ensures we don't lose track of completions without IDs
      countWithoutId++;
    }
  }

  // Return count of unique questIds plus any completions without IDs
  return uniqueQuestIds.size + countWithoutId;
}

module.exports = {
  countUniqueQuestCompletions,
};
