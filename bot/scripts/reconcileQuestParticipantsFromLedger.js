// ============================================================================
// reconcileQuestParticipantsFromLedger.js
//
// For participants stuck as progress "completed" OR "rewarded" with no tokensEarned
// on the quest doc, but TokenTransaction already shows quest_reward for this quest:
// copies amount + timestamp from the ledger onto the participant and sets
// progress to "rewarded". Does NOT change user token balances or add txs.
//
// If this user has no quest_reward row (common for collab partners), looks up
// ApprovedSubmission for this quest where they are collab/tagged, then uses
// the submitter's matching quest_reward tx as the amount to store on the quest doc.
//
// Fallbacks when submission rows omit collabs or questEvent format differs:
//   - any other participant on this quest who has a quest_reward for this title
//   - submitter of the newest ApprovedSubmission whose questEvent contains this questID
//
// Default: DRY RUN. Use --apply to write.
//
// Usage:
//   node bot/scripts/reconcileQuestParticipantsFromLedger.js Q915540
//   node bot/scripts/reconcileQuestParticipantsFromLedger.js Q915540 --apply
// ============================================================================
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const DatabaseConnectionManager = require("../database/connectionManager");
const Quest = require("../models/QuestModel");
const TokenTransaction = require("../models/TokenTransactionModel");
const ApprovedSubmission = require("../models/ApprovedSubmissionModel");
const logger = require("../utils/logger");

function loadEnv() {
  const env = process.env.NODE_ENV || "development";
  const rootEnvPath = path.resolve(__dirname, "..", "..", ".env");
  const envSpecificPath = path.resolve(__dirname, "..", "..", `.env.${env}`);
  if (fs.existsSync(envSpecificPath)) dotenv.config({ path: envSpecificPath });
  else if (fs.existsSync(rootEnvPath)) dotenv.config({ path: rootEnvPath });
  else dotenv.config();
}

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUserId(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const digits = s.replace(/[<@!>]/g, "").replace(/\D/g, "");
  return digits.length >= 16 ? digits : s.replace(/[<@!>]/g, "").trim();
}

async function findLedgerQuestReward(userId, questTitle) {
  const title = String(questTitle || "").trim();
  if (!userId || !title) return { tx: null };

  const exactPat = new RegExp(`^Quest:\\s*${escapeRegex(title)}\\s*$`, "i");
  let tx = await TokenTransaction.findOne({
    userId,
    category: "quest_reward",
    type: "earned",
    description: exactPat,
  })
    .sort({ timestamp: -1 })
    .lean();
  if (tx) return { tx };

  const stripped = title.replace(/[!?.]+$/g, "").trim();
  if (stripped && stripped !== title) {
    const stripPat = new RegExp(`^Quest:\\s*${escapeRegex(stripped)}`, "i");
    tx = await TokenTransaction.findOne({
      userId,
      category: "quest_reward",
      type: "earned",
      description: stripPat,
    })
      .sort({ timestamp: -1 })
      .lean();
    if (tx) return { tx };
  }

  const containsPat = new RegExp(escapeRegex(stripped || title), "i");
  tx = await TokenTransaction.findOne({
    userId,
    category: "quest_reward",
    type: "earned",
    description: containsPat,
  })
    .sort({ timestamp: -1 })
    .lean();
  return { tx };
}

function collabIdsFromSubmission(sub) {
  if (!sub || !sub.collab) return [];
  const raw = sub.collab === "N/A" ? [] : sub.collab;
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((m) => normalizeUserId(String(m || "")))
    .filter(Boolean);
}

function submissionTouchesParticipant(sub, participantUserId, characterName) {
  const uid = normalizeUserId(participantUserId);
  if (!uid) return false;
  if (normalizeUserId(sub.userId) === uid) return true;
  if (collabIdsFromSubmission(sub).includes(uid)) return true;
  const tagged = Array.isArray(sub.taggedCharacters) ? sub.taggedCharacters : [];
  const cn = String(characterName || "").trim().toLowerCase();
  if (cn && tagged.some((t) => String(t).trim().toLowerCase() === cn)) return true;
  return false;
}

function approvedSubmissionsQueryForQuest(questID) {
  return {
    questEvent: new RegExp(escapeRegex(questID), "i"),
  };
}

/**
 * Collab/tagged partners often have no quest_reward under their own userId; the tx is on the submitter.
 * Find a matching quest_reward for the submitter of an approved submission for this quest that includes this participant.
 */
async function findLedgerQuestRewardViaSubmitter(
  participantUserId,
  characterName,
  questID,
  questTitle
) {
  const subs = await ApprovedSubmission.find(approvedSubmissionsQueryForQuest(questID))
    .sort({ approvedAt: -1 })
    .lean();

  for (const sub of subs) {
    if (!submissionTouchesParticipant(sub, participantUserId, characterName)) continue;
    const submitterId = normalizeUserId(sub.userId);
    if (!submitterId) continue;
    const { tx } = await findLedgerQuestReward(submitterId, questTitle);
    if (tx && Number.isFinite(Number(tx.amount)) && Number(tx.amount) > 0) {
      return { tx, submitterUserId: submitterId };
    }
  }
  return { tx: null, submitterUserId: null };
}

/**
 * Any participant on this quest with their own quest_reward row (same title).
 */
async function findLedgerQuestRewardViaAnyParticipantOnQuest(quest, questTitle) {
  if (!quest.participants || typeof quest.participants.entries !== "function") {
    return { tx: null, fromUserId: null };
  }
  for (const [, p] of quest.participants.entries()) {
    const uid = normalizeUserId(p.userId);
    if (!uid) continue;
    const { tx } = await findLedgerQuestReward(uid, questTitle);
    if (tx && Number.isFinite(Number(tx.amount)) && Number(tx.amount) > 0) {
      return { tx, fromUserId: uid };
    }
  }
  return { tx: null, fromUserId: null };
}

/**
 * Newest submission for this questID: use submitter's quest_reward (no collab check).
 * Use when collab lines were never saved on ApprovedSubmission but payout went to submitter.
 */
async function findLedgerQuestRewardViaFirstSubmissionSubmitter(questID, questTitle) {
  const subs = await ApprovedSubmission.find(approvedSubmissionsQueryForQuest(questID))
    .sort({ approvedAt: -1 })
    .lean();
  for (const sub of subs) {
    const submitterId = normalizeUserId(sub.userId);
    if (!submitterId) continue;
    const { tx } = await findLedgerQuestReward(submitterId, questTitle);
    if (tx && Number.isFinite(Number(tx.amount)) && Number(tx.amount) > 0) {
      return { tx, submitterUserId: submitterId };
    }
  }
  return { tx: null, submitterUserId: null };
}

function needsReconcile(p) {
  if (!p || typeof p !== "object") return false;
  const prog = String(p.progress || "").toLowerCase();
  if (prog !== "completed" && prog !== "rewarded") return false;
  const te = Number(p.tokensEarned);
  if (Number.isFinite(te) && te > 0) return false;
  return true;
}

async function main() {
  loadEnv();
  const questIdArg = process.argv.find((a) => /^Q\d+$/i.test(a));
  const apply = process.argv.includes("--apply");

  if (!questIdArg) {
    console.error(
      "Usage: node bot/scripts/reconcileQuestParticipantsFromLedger.js Q915540 [--apply]"
    );
    process.exit(1);
  }

  const questID = questIdArg.toUpperCase();
  await DatabaseConnectionManager.initialize();

  try {
    const quest = await Quest.findOne({ questID }).exec();
    if (!quest) {
      console.error(`Quest not found: ${questID}`);
      process.exit(1);
    }

    const title = quest.title || "";
    console.log(`\n${questID} — "${title}" (${apply ? "APPLY" : "DRY RUN"})\n`);

    let wouldFix = 0;
    let notTargetRow = 0;
    let noTx = 0;

    const planned = [];

    for (const [mapKey, p] of quest.participants.entries()) {
      if (!needsReconcile(p)) {
        notTargetRow++;
        continue;
      }
      const uid = normalizeUserId(p.userId);
      let { tx } = await findLedgerQuestReward(uid, title);
      let viaNote = "own_ledger";
      if (!tx || !Number.isFinite(Number(tx.amount)) || Number(tx.amount) <= 0) {
        const proxy = await findLedgerQuestRewardViaSubmitter(
          uid,
          p.characterName,
          questID,
          title
        );
        if (proxy.tx) {
          tx = proxy.tx;
          viaNote = `submitter_ledger (submitter=${proxy.submitterUserId})`;
        }
      }
      if (!tx || !Number.isFinite(Number(tx.amount)) || Number(tx.amount) <= 0) {
        const anyP = await findLedgerQuestRewardViaAnyParticipantOnQuest(quest, title);
        if (anyP.tx) {
          tx = anyP.tx;
          viaNote = `same_quest_ledger (copied from participant userId=${anyP.fromUserId})`;
        }
      }
      if (!tx || !Number.isFinite(Number(tx.amount)) || Number(tx.amount) <= 0) {
        const firstSub = await findLedgerQuestRewardViaFirstSubmissionSubmitter(
          questID,
          title
        );
        if (firstSub.tx) {
          tx = firstSub.tx;
          viaNote = `first_submission_submitter (submitter=${firstSub.submitterUserId})`;
        }
      }
      if (!tx || !Number.isFinite(Number(tx.amount)) || Number(tx.amount) <= 0) {
        noTx++;
        console.log(
          `SKIP (no quest_reward for user, and no ledger match via submission / same quest / first submission): ${p.characterName || "?"} userId=${uid}`
        );
        continue;
      }
      wouldFix++;
      planned.push({
        mapKey,
        characterName: p.characterName,
        userId: uid,
        amount: tx.amount,
        rewardedAt: tx.timestamp,
      });
      console.log(
        `${apply ? "UPDATE" : "WOULD UPDATE"}: ${p.characterName} -> rewarded, tokensEarned=${tx.amount}, rewardedAt=${tx.timestamp?.toISOString?.() || tx.timestamp} [${viaNote}]`
      );
    }

    console.log(
      `\nSummary: will reconcile ${wouldFix} | other participant rows (not completed+zero tokens) ${notTargetRow} | completed but no ledger match ${noTx}`
    );

    if (wouldFix === 0) {
      logger.info("QUEST_RECONCILE", "Nothing to do.");
    } else if (apply) {
      for (const row of planned) {
        const p = quest.participants.get(row.mapKey);
        if (!p) continue;
        p.progress = "rewarded";
        p.tokensEarned = row.amount;
        p.rewardedAt = row.rewardedAt ? new Date(row.rewardedAt) : new Date();
        if (!p.completedAt) p.completedAt = p.rewardedAt;
      }
      quest.markModified("participants");
      await quest.save();
      logger.success(
        "QUEST_RECONCILE",
        `Saved quest ${questID}: ${wouldFix} participant(s) aligned with ledger (no new tokens issued).`
      );
    } else {
      logger.info(
        "QUEST_RECONCILE",
        "Re-run with --apply to write these changes to the quest document."
      );
    }
  } finally {
    await DatabaseConnectionManager.closeAll();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
