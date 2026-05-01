// ============================================================================
// Align participant.progress with tokens already recorded on the quest doc.
// Used by QuestModel pre-save and admin API so dashboard paths stay consistent
// with the bot (completed + tokensEarned>0 -> rewarded unless rewardProcessed marks a closed quest).
//
// Admin reward endpoints also mirror bot/questRewardModule: hydrate ApprovedSubmission
// rows onto the participant before meetsRequirements so Art/Writing quests are not
// paid out to join-only participants.
// ============================================================================

const ApprovedSubmission = require("../models/ApprovedSubmissionModel.js");
const QuestStatics = require("../models/QuestModel.js");

function normalizeDiscordId(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const unwrapped = s.replace(/[<@!>]/g, "").trim();
  const digitsOnly = unwrapped.replace(/\D/g, "");
  return digitsOnly.length >= 16 ? digitsOnly : unwrapped;
}

function questTypeUsesApprovedSubmissionHydration(questType) {
  const qt = String(questType || "");
  return qt === "Art" || qt === "Writing" || qt === "Art / Writing";
}

/**
 * Pull ApprovedSubmission docs into participant.submissions (same rules as bot
 * syncApprovedSubmissionsToParticipant). No-op for non Art/Writing quests.
 *
 * @param {object} quest Mongoose Quest doc
 * @param {object} participant Participant map value (mutated)
 */
async function hydrateApprovedSubmissionsForParticipant(quest, participant) {
  if (!quest || !participant || !questTypeUsesApprovedSubmissionHydration(quest.questType)) {
    return;
  }
  const qid = quest.questID;
  if (!qid || String(qid).trim() === "") return;
  const uid = participant.userId;
  if (!uid) return;

  const uidNorm = normalizeDiscordId(uid);
  const userIdCandidates = [...new Set([String(uid).trim(), uidNorm].filter(Boolean))];

  const rows = await ApprovedSubmission.find({
    questEvent: qid,
    userId: { $in: userIdCandidates },
    approvedAt: { $exists: true, $ne: null },
  })
    .lean()
    .exec();

  const questTypeLc = String(quest.questType || "").toLowerCase();

  if (!Array.isArray(participant.submissions)) {
    participant.submissions = [];
  }

  for (const submission of rows) {
    const submissionType = String(submission.category || "").toLowerCase();
    let shouldSync = false;
    if (questTypeLc === "art" && submissionType === "art") shouldSync = true;
    else if (questTypeLc === "writing" && submissionType === "writing") shouldSync = true;
    else if (questTypeLc === "art / writing" || questTypeLc === "art/writing") shouldSync = true;
    if (!shouldSync) continue;

    const submissionExists = participant.submissions.some(
      (sub) =>
        sub.url === submission.messageUrl ||
        sub.url === submission.fileUrl ||
        sub.url === submission.link ||
        (String(sub.type || "").toLowerCase() === submissionType &&
          sub.approved &&
          sub.approvedAt &&
          submission.approvedAt &&
          Math.abs(
            new Date(sub.approvedAt).getTime() - new Date(submission.approvedAt).getTime()
          ) < 60000)
    );

    if (!submissionExists) {
      participant.submissions.push({
        type: submissionType,
        url: submission.messageUrl || submission.fileUrl || submission.link,
        submittedAt: submission.submittedAt || submission.approvedAt,
        approved: true,
        approvedBy: submission.approvedBy,
        approvedAt: submission.approvedAt,
      });
    }
  }
}

/**
 * @param {object} quest Mongoose Quest doc (needs meetsRequirements method)
 * @param {object} participant Participant map value (may be mutated by hydrate)
 * @returns {Promise<boolean>}
 */
async function ensureParticipantEligibleForDashboardReward(quest, participant) {
  await hydrateApprovedSubmissionsForParticipant(quest, participant);
  if (typeof quest.meetsRequirements !== "function") return false;
  let blupeeTallyMap = null;
  if (QuestStatics.isBlupeeInteractiveQuest?.(quest)) {
    blupeeTallyMap = await QuestStatics.fetchBlupeeSeasonTallyMap([participant.userId]);
  }
  return quest.meetsRequirements(participant, quest, { blupeeTallyMap });
}

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
    if (
      p.progress === "completed" &&
      p.rewardProcessed !== true &&
      Number.isFinite(te) &&
      te > 0
    ) {
      p.progress = "rewarded";
      if (!p.rewardedAt) {
        p.rewardedAt = p.completedAt ? new Date(p.completedAt) : new Date();
      }
      fixedCount++;
    }
  }
  return { fixedCount };
}

/**
 * When Quest#checkTimeExpiration() is true, any participant still `active` who does not
 * meet requirements (after Art/Writing hydration) is marked `failed`. Matches bot expiry
 * behavior for admin UI and manual complete flows.
 *
 * @param {import('mongoose').Document} quest Mongoose Quest document (mutated; saves if changes)
 * @returns {Promise<{ markedFailed: number; saved: boolean }>}
 */
async function markActiveParticipantsFailedAfterQuestPeriod(quest) {
  if (!quest || typeof quest.checkTimeExpiration !== "function") {
    return { markedFailed: 0, saved: false };
  }
  if (!quest.checkTimeExpiration()) {
    return { markedFailed: 0, saved: false };
  }
  const st = quest.status;
  if (st !== "active" && st !== "completed") {
    return { markedFailed: 0, saved: false };
  }
  if (!quest.participants || typeof quest.participants.entries !== "function") {
    return { markedFailed: 0, saved: false };
  }

  const now = new Date();
  let markedFailed = 0;

  let blupeeTallyMap = null;
  if (QuestStatics.isBlupeeInteractiveQuest?.(quest) && quest.participants?.size) {
    const ids = Array.from(quest.participants.values())
      .map((p) => p.userId)
      .filter(Boolean);
    blupeeTallyMap = await QuestStatics.fetchBlupeeSeasonTallyMap(ids);
  }
  const reqOpts = { blupeeTallyMap };

  for (const [, participant] of quest.participants.entries()) {
    if (!participant || typeof participant !== "object") continue;
    if (participant.progress !== "active") continue;

    await hydrateApprovedSubmissionsForParticipant(quest, participant);

    const ok =
      typeof quest.meetsRequirements === "function" &&
      quest.meetsRequirements(participant, quest, reqOpts);

    if (!ok) {
      participant.progress = "failed";
      participant.updatedAt = now;
      participant.completedAt = null;
      participant.rewardedAt = null;
      participant.disqualifiedAt = null;
      participant.disqualificationReason = null;
      markedFailed += 1;
    }
  }

  if (markedFailed === 0) {
    return { markedFailed: 0, saved: false };
  }

  quest.markModified("participants");
  await quest.save();
  return { markedFailed, saved: true };
}

/**
 * Once quest.status is `completed`, move paid participants from `rewarded` to terminal `completed`
 * (active → … → rewarded → completed). No-op if quest is still open.
 *
 * @param {object} quest Mongoose Quest doc (mutates participants)
 * @returns {number} how many rows were promoted
 */
function promoteRewardedParticipantsToFinalCompleted(quest) {
  if (!quest || quest.status !== "completed" || !quest.participants?.values) {
    return 0;
  }
  const now = new Date();
  let n = 0;
  for (const p of quest.participants.values()) {
    if (!p || typeof p !== "object" || p.progress !== "rewarded") continue;
    p.progress = "completed";
    p.updatedAt = now;
    n += 1;
  }
  return n;
}

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match TokenTransaction.description to a quest (bot: Quest: Title, dashboard: title only, etc.). */
function transactionDescriptionMatchesQuest(description, questTitle, questID) {
  const desc = String(description || "").trim();
  if (!desc) return false;
  const title = String(questTitle || "").trim();
  const qid = String(questID || "").trim();

  if (title) {
    if (desc.toLowerCase() === title.toLowerCase()) return true;
    const exactQuestColon = new RegExp(`^Quest:\\s*${escapeRegex(title)}\\s*$`, "i");
    if (exactQuestColon.test(desc)) return true;
    const stripped = title.replace(/[!?.]+$/g, "").trim();
    if (stripped && stripped !== title) {
      const stripQuestColon = new RegExp(`^Quest:\\s*${escapeRegex(stripped)}`, "i");
      if (stripQuestColon.test(desc)) return true;
    }
    const needle = stripped || title;
    if (needle && new RegExp(escapeRegex(needle), "i").test(desc)) return true;
  }

  if (qid) {
    const idPlain = new RegExp(`^${escapeRegex(qid)}$`, "i");
    if (idPlain.test(desc)) return true;
    const questWordId = new RegExp(`^Quest\\s+${escapeRegex(qid)}\\b`, "i");
    if (questWordId.test(desc)) return true;
    if (new RegExp(escapeRegex(qid), "i").test(desc)) return true;
  }
  return false;
}

/**
 * Admin UI only: set ledgerQuestRewardAmount / ledgerQuestRewardAt on each participant object
 * when a matching quest_reward TokenTransaction exists (row may still be stale).
 *
 * @param {Record<string, object>|null|undefined} participantsObj
 * @param {string} questTitle
 * @param {string} questID
 */
async function attachLedgerQuestRewardHintsToParticipants(participantsObj, questTitle, questID) {
  if (!participantsObj || typeof participantsObj !== "object") return;
  const title = String(questTitle || "").trim();
  const qid = String(questID || "").trim();
  if (!title && !qid) return;

  const userIds = new Set();
  for (const [key, p] of Object.entries(participantsObj)) {
    if (!p || typeof p !== "object") continue;
    const uid = normalizeDiscordId(p.userId ?? key);
    if (uid) userIds.add(uid);
  }
  if (userIds.size === 0) return;

  const TokenTransaction = require("../models/TokenTransactionModel.js");
  const txs = await TokenTransaction.find({
    userId: { $in: Array.from(userIds) },
    category: "quest_reward",
    type: "earned",
  })
    .sort({ timestamp: -1 })
    .lean()
    .exec();

  const bestByUser = new Map();
  for (const tx of txs) {
    const uid = normalizeDiscordId(tx.userId);
    if (!uid || !userIds.has(uid)) continue;
    if (!transactionDescriptionMatchesQuest(tx.description, title, qid)) continue;
    if (!bestByUser.has(uid)) {
      bestByUser.set(uid, tx);
    }
  }

  for (const [key, p] of Object.entries(participantsObj)) {
    if (!p || typeof p !== "object") continue;
    const uid = normalizeDiscordId(p.userId ?? key);
    if (!uid) continue;
    const tx = bestByUser.get(uid);
    if (tx && Number.isFinite(Number(tx.amount)) && Number(tx.amount) > 0) {
      const amt = Math.max(0, Math.floor(Number(tx.amount)));
      p.ledgerQuestRewardAmount = amt;
      p.ledgerQuestRewardAt =
        tx.timestamp != null ? new Date(tx.timestamp).toISOString() : null;
    }
  }
}

module.exports = {
  normalizeParticipantsRewardProgress,
  hydrateApprovedSubmissionsForParticipant,
  ensureParticipantEligibleForDashboardReward,
  markActiveParticipantsFailedAfterQuestPeriod,
  promoteRewardedParticipantsToFinalCompleted,
  attachLedgerQuestRewardHintsToParticipants,
};
