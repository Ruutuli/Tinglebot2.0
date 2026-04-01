// ============================================================================
// Align participant.progress with tokens already recorded on the quest doc.
// Used by QuestModel pre-save and admin API so dashboard paths stay consistent
// with the bot (completed + tokensEarned>0 -> rewarded).
// ============================================================================

/**
 * @param {import('mongoose').Map<string, object> | null | undefined} participants
 * @returns {{ fixedCount: number }}
 */
function normalizeParticipantsRewardProgress(participants) {
  if (!participants || typeof participants.entries !== "function") {
    return { fixedCount: 0 };
  }
  let fixedCount = 0;
  for (const [, p] of participants.entries()) {
    if (!p || typeof p !== "object") continue;
    let te = Number(p.tokensEarned);
    if (
      p.progress === "completed" &&
      p.questTokensPaidViaSubmission === true &&
      (!Number.isFinite(te) || te <= 0)
    ) {
      const subAmt = Number(p.submissionRewardTokenAmount);
      if (Number.isFinite(subAmt) && subAmt > 0) {
        p.tokensEarned = subAmt;
        te = subAmt;
      }
    }
    if (p.progress === "completed" && Number.isFinite(te) && te > 0) {
      p.progress = "rewarded";
      if (!p.rewardedAt) {
        p.rewardedAt = p.completedAt ? new Date(p.completedAt) : new Date();
      }
      fixedCount++;
    }
  }
  return { fixedCount };
}

module.exports = { normalizeParticipantsRewardProgress };
