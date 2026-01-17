// ============================================================================
// ------------------- questTrackingUtils.js -------------------
// Shared helpers for quest completion and turn-in tracking.
// Used by UserModel and fix scripts (fixQuestPendingTurnIns, fixMissingQuestCompletions).
// ============================================================================

/**
 * Count unique quest completions by questId.
 * Entries with empty/null questId count as 1 each (match legacy behavior).
 * @param {Array} completions - Array of completion objects with optional questId
 * @returns {number}
 */
function countUniqueQuestCompletions(completions) {
  if (!Array.isArray(completions) || completions.length === 0) {
    return 0;
  }

  const uniqueQuestIds = new Set();
  let nullIdCount = 0;

  for (const completion of completions) {
    if (completion.questId && completion.questId.trim() !== '') {
      uniqueQuestIds.add(completion.questId);
    } else {
      nullIdCount++;
    }
  }

  return uniqueQuestIds.size + nullIdCount;
}

module.exports = {
  countUniqueQuestCompletions
};
