/**
 * Stub quest reward module for dashboard context.
 * The full bot uses this for Discord notifications and reward processing.
 * Dashboard API routes use QuestModel for reads; these are no-ops here.
 * Do not rely on QuestModel for recording completion; use User.recordQuestCompletion in API routes.
 */

async function sendQuestCompletionNotification() {
  /* no-op */
}

async function sendQuestCompletionSummary() {
  /* no-op */
}

async function recordQuestCompletionSafeguard() {
  /* no-op */
}

module.exports = {
  sendQuestCompletionNotification,
  sendQuestCompletionSummary,
  recordQuestCompletionSafeguard,
};
