// ============================================================================
// simulateMonthlyQuestClose.js
//
// Simulates "end of month" for listed quests whose automatic close did not run
// (e.g. checkTimeExpiration() false because timeLimit missing, cron missed, etc.).
//
// For each matching ACTIVE quest:
//   1. Optionally syncs ApprovedSubmission → participant (Art / Writing / Art+Writing)
//   2. Runs checkAutoCompletion(true, { forceTimeExpired: true }) — same expiry rules as
//      production: qualifiers → completed, remaining active → failed; quest status → completed
//   3. Runs processQuestCompletion(questID) — token + item rewards, summary embed (like scheduled flow)
//   4. Marks completion processed
//
// Then optionally runs processMonthlyQuestRewards() to pay any completed quests that still
// need the monthly payout path (idempotent if step 3 already rewarded everyone).
//
// Default: DRY RUN (lists each participant: active → completed/failed after simulated expiry, plus requirement hints).
//
// Usage (repo root):
//   node bot/scripts/simulateMonthlyQuestClose.js --date 2026-04
//   node bot/scripts/simulateMonthlyQuestClose.js --date 2026-04 --sync-submissions
//   node bot/scripts/simulateMonthlyQuestClose.js --date 2026-04 --apply --sync-submissions
//   node bot/scripts/simulateMonthlyQuestClose.js --quest-id Q945272 --apply
//   node bot/scripts/simulateMonthlyQuestClose.js --date 2026-04 --apply --monthly-catchup
//
// Flags:
//   --apply              Persist changes and run rewards
//   --sync-submissions   APPLY: persist sync. DRY RUN: merge approved rows into in-memory copies only (shows what would qualify).
//   --monthly-catchup    After per-quest processing, run processMonthlyQuestRewards() once
//   --status <s>         Quest document filter: active | completed | pending | any (default: active)
//   --skip-reward-step   Only force-close quest rows (expiry + participant completed/failed); no processQuestCompletion
// ============================================================================

const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const DatabaseConnectionManager = require("../database/connectionManager");
const Quest = require("../models/QuestModel");
const ApprovedSubmission = require("../models/ApprovedSubmissionModel");
const questRewardModule = require("../modules/questRewardModule");

const meetsRequirements = Quest.meetsRequirements;
const resolvePostRequirement = Quest.resolvePostRequirement;

const {
  processQuestCompletion,
  processMonthlyQuestRewards,
  QUEST_TYPES,
  syncApprovedSubmissionsToParticipant,
} = questRewardModule;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function loadEnv() {
  const env = process.env.NODE_ENV || "development";
  const rootEnvPath = path.resolve(__dirname, "..", "..", ".env");
  const envSpecificPath = path.resolve(__dirname, "..", "..", `.env.${env}`);

  if (fs.existsSync(envSpecificPath)) {
    dotenv.config({ path: envSpecificPath });
  } else if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
  } else {
    dotenv.config();
  }
}

function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (v == null || v.startsWith("--")) return null;
  return v;
}

function dateClause(yyyyMm) {
  const m = String(yyyyMm || "").trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  const [yStr, moStr] = m.split("-");
  const y = Number(yStr);
  const mo = Number(moStr);
  if (!y || mo < 1 || mo > 12) return null;
  const monthName = MONTH_NAMES[mo - 1];
  return {
    $or: [{ date: m }, { date: new RegExp(`^${monthName}\\s+${y}$`, "i") }],
  };
}

async function loadQuests({ questId, mongoId, dateYm, questStatus }) {
  const clauses = [];

  if (mongoId) {
    if (!mongoose.Types.ObjectId.isValid(mongoId)) {
      throw new Error(`Invalid --mongo-id: ${mongoId}`);
    }
    const q = await Quest.findById(mongoId).exec();
    return q ? [q] : [];
  }

  if (questId) {
    const q = await Quest.findOne({ questID: String(questId).trim() }).exec();
    return q ? [q] : [];
  }

  if (dateYm) {
    const dc = dateClause(dateYm);
    if (!dc) {
      throw new Error(`Invalid --date (use YYYY-MM): ${dateYm}`);
    }
    clauses.push(dc);
  } else {
    throw new Error("Provide --date YYYY-MM, --quest-id, or --mongo-id");
  }

  const filter = { $and: clauses };
  if (questStatus && questStatus !== "any") {
    filter.$and.push({ status: questStatus });
  }

  return Quest.find(filter).exec();
}

/** Plain object copy for evaluation (does not mutate the live quest document). */
function participantToPlain(participant) {
  if (!participant || typeof participant !== "object") return null;
  const o = typeof participant.toObject === "function" ? participant.toObject() : { ...participant };
  const json = JSON.parse(JSON.stringify(o));
  if (!Array.isArray(json.submissions)) {
    json.submissions = json.submissions ? [].concat(json.submissions) : [];
  }
  return json;
}

function resolveRequiredRollsHint(quest) {
  const r = quest?.requiredRolls;
  const n = typeof r === "number" && Number.isFinite(r) ? r : Number(r);
  if (Number.isFinite(n) && n >= 1) return Math.min(Math.floor(n), 100000);
  return Quest.DEFAULT_ROLL_REQUIREMENT;
}

/** Requirement snapshot for logs (matches QuestModel.meetsRequirements inputs). */
function requirementHint(participant, quest, blupeeTallyMap = null) {
  const qt = quest.questType;
  const posts = Number(participant.rpPostCount) || 0;
  const effPosts = resolvePostRequirement(quest);
  const rolls = Number(participant.successfulRolls) || 0;
  const reqR = resolveRequiredRollsHint(quest);

  if (qt === QUEST_TYPES.RP) {
    if (effPosts === 0) return `posts ${posts} (no min)`;
    return `posts ${posts}/${effPosts}`;
  }
  if (qt === QUEST_TYPES.INTERACTIVE_RP) {
    const pLine = effPosts === 0 ? `posts ${posts} (no min)` : `posts ${posts}/${effPosts}`;
    if (Quest.isBlupeeInteractiveQuest?.(quest)) {
      const uid = String(participant.userId || "").trim();
      const tally =
        blupeeTallyMap && uid ? Number(blupeeTallyMap.get(uid)) || 0 : 0;
      const eff = Quest.interactiveEffectiveRollCount
        ? Quest.interactiveEffectiveRollCount(participant, quest, blupeeTallyMap)
        : Math.max(rolls, tally);
      return `${pLine}; Blupee rupees ${eff}/${reqR} (TempData tally=${tally}; successfulRolls=${rolls})`;
    }
    return `${pLine}; table rolls ${rolls}/${reqR}`;
  }
  if (qt === QUEST_TYPES.INTERACTIVE) {
    if (Quest.isBlupeeInteractiveQuest?.(quest)) {
      const uid = String(participant.userId || "").trim();
      const tally =
        blupeeTallyMap && uid ? Number(blupeeTallyMap.get(uid)) || 0 : 0;
      const eff = Quest.interactiveEffectiveRollCount
        ? Quest.interactiveEffectiveRollCount(participant, quest, blupeeTallyMap)
        : Math.max(rolls, tally);
      return `Blupee rupees ${eff}/${reqR} (TempData season tally=${tally}; quest successfulRolls=${rolls})`;
    }
    return `table rolls ${rolls}/${reqR}`;
  }
  if (qt === QUEST_TYPES.ART || qt === QUEST_TYPES.WRITING) {
    const type = qt.toLowerCase();
    const has = (participant.submissions || []).some(
      (s) => String(s.type || "").toLowerCase() === type && s.approved
    );
    const prog = String(participant.progress || "").toLowerCase();
    const te = Number(participant.tokensEarned);
    const paidRow = prog === "rewarded" || (Number.isFinite(te) && te > 0);
    const base = `approved ${type} on quest doc: ${has ? "yes" : "no"}`;
    if (paidRow) {
      const teDisp = Number.isFinite(te) ? te : 0;
      return `${base}; payout row: progress=${prog || "?"} tokensEarned=${teDisp} (rewarded can occur without submissions[] if adjusted manually)`;
    }
    return base;
  }
  if (qt === QUEST_TYPES.ART_WRITING) {
    const mode = (quest.artWritingMode || "both").toLowerCase();
    const subs = participant.submissions || [];
    const art = subs.some((s) => String(s.type || "").toLowerCase() === "art" && s.approved);
    const wri = subs.some((s) => String(s.type || "").toLowerCase() === "writing" && s.approved);
    return mode === "either" ? `either: art=${art} writing=${wri}` : `both: art=${art} writing=${wri}`;
  }
  return "quest type: (no automatic hint)";
}

/**
 * Read-only: merge ApprovedSubmission rows into a plain participant clone (no saves, no pings, no profile writes).
 * Returns how many submission rows were added to the clone.
 */
async function mergeApprovedSubmissionsPreview(quest, participantPlain) {
  if (
    quest.questType !== QUEST_TYPES.ART &&
    quest.questType !== QUEST_TYPES.WRITING &&
    quest.questType !== QUEST_TYPES.ART_WRITING
  ) {
    return 0;
  }
  const approvedSubmissions = await ApprovedSubmission.find({
    questEvent: quest.questID,
    userId: participantPlain.userId,
    approvedAt: { $exists: true, $ne: null },
  }).lean();

  let added = 0;
  const questType = quest.questType.toLowerCase();

  for (const submission of approvedSubmissions) {
    const submissionType = String(submission.category || "").toLowerCase();
    let shouldSync = false;
    if (questType === "art" && submissionType === "art") shouldSync = true;
    else if (questType === "writing" && submissionType === "writing") shouldSync = true;
    else if (questType === "art / writing" || questType === "art/writing") shouldSync = true;
    if (!shouldSync) continue;

    const submissionExists = (participantPlain.submissions || []).some(
      (sub) =>
        sub.url === submission.messageUrl ||
        sub.url === submission.fileUrl ||
        (sub.type === submission.category &&
          sub.approved &&
          sub.approvedAt &&
          Math.abs(new Date(sub.approvedAt).getTime() - new Date(submission.approvedAt).getTime()) < 60000)
    );
    if (submissionExists) continue;

    if (!participantPlain.submissions) participantPlain.submissions = [];
    participantPlain.submissions.push({
      type: submission.category,
      url: submission.messageUrl || submission.fileUrl,
      submittedAt: submission.submittedAt || submission.approvedAt,
      approved: true,
      approvedBy: submission.approvedBy,
      approvedAt: submission.approvedAt,
    });
    added++;
  }
  return added;
}

async function printDryRunQuestDetails(quest, { syncSubmissions, skipRewardStep }, stats) {
  const artW =
    quest.questType === QUEST_TYPES.ART ||
    quest.questType === QUEST_TYPES.WRITING ||
    quest.questType === QUEST_TYPES.ART_WRITING;

  let blupeeTallyMap = null;
  if (
    typeof Quest.isBlupeeInteractiveQuest === "function" &&
    Quest.isBlupeeInteractiveQuest(quest) &&
    quest.participants?.size
  ) {
    const ids = Array.from(quest.participants.values())
      .map((p) => p.userId)
      .filter(Boolean);
    blupeeTallyMap = await Quest.fetchBlupeeSeasonTallyMap(ids);
  }
  const reqOpts = { blupeeTallyMap };

  if (Quest.isBlupeeInteractiveQuest?.(quest)) {
    console.log(
      `  Source: TempData blupeeRupeeTally (UTC season ${new Date().getUTCFullYear()}), same as quest board — completion uses max(tally, successfulRolls) vs required.`
    );
  }

  console.log(
    `  Participant progress (DB): active → completed (queued for payout) → rewarded (payout on row) → completed (terminal once the quest doc is closed).`
  );

  let virtualAdds = 0;
  if (!quest.participants || typeof quest.participants.entries !== "function") {
    console.log(`  (no participants map)`);
    return;
  }

  const rows = [];
  for (const [, participant] of quest.participants.entries()) {
    if (!participant || typeof participant !== "object") continue;
    const char = participant.characterName || "?";
    const uid = participant.userId || "?";
    const plain = participantToPlain(participant);
    if (!plain) continue;

    if (syncSubmissions && artW) {
      const add = await mergeApprovedSubmissionsPreview(quest, plain);
      virtualAdds += add;
    }

    const prog = String(plain.progress || "active").toLowerCase();
    const hint = requirementHint(plain, quest, blupeeTallyMap);
    const ok = meetsRequirements(plain, quest, reqOpts);

    const te = Number(plain.tokensEarned);
    const completedFinal =
      prog === "completed" &&
      (plain.rewardProcessed === true || (Number.isFinite(te) && te > 0));
    if (prog === "rewarded") {
      const note = skipRewardStep
        ? "stays rewarded (add full apply without --skip-reward-step to run processQuestCompletion → terminal completed)"
        : "→ completed on --apply after processQuestCompletion (promotes paid rows; DB still shows rewarded until then)";
      rows.push(`  rewarded ${note} | ${char} | userId=${uid} | ${hint}`);
      if (!skipRewardStep) stats.dryRunWouldPromoteRewardedToCompleted += 1;
      continue;
    }
    if (prog === "disqualified" || completedFinal) {
      rows.push(
        `  ${prog} (no change when quest closes) | ${char} | userId=${uid} | ${hint}`
      );
      stats.dryRunUnchangedTerminal++;
      continue;
    }

    if (prog !== "active") {
      rows.push(
        `  ${prog} (no change when quest closes — already left active) | ${char} | userId=${uid} | stillMeets=${ok} | ${hint}`
      );
      stats.dryRunUnchangedNonActive++;
      continue;
    }

    const after = ok ? "completed" : "failed";
    stats[after === "completed" ? "dryRunWouldComplete" : "dryRunWouldFail"]++;
    rows.push(
      `  active → ${after} | ${char} | userId=${uid} | meetsRequirements=${ok} | ${hint}`
    );
  }

  if (syncSubmissions && artW) {
    console.log(
      `  (dry-run virtual sync: +${virtualAdds} approved submission row(s) merged into preview copies only; DB unchanged)`
    );
  } else if (syncSubmissions && !artW) {
    console.log(`  (--sync-submissions ignored for quest type ${quest.questType})`);
  }

  if (rows.length === 0) {
    console.log(`  (no participant rows)`);
    return;
  }
  for (const line of rows) console.log(line);

  const rewardNote =
    "After --apply (without --skip-reward-step): active + qualifies → completed (queue) then payout → rewarded, then promote → terminal completed. Rows already rewarded only get the final promotion to completed. Active + not qualifies → failed. Pre-payout completed rows get payout if needs_rewarding.";
  console.log(`  → ${rewardNote}`);
}

async function syncQuestSubmissions(quest) {
  const qt = quest.questType;
  if (
    qt !== QUEST_TYPES.ART &&
    qt !== QUEST_TYPES.WRITING &&
    qt !== QUEST_TYPES.ART_WRITING
  ) {
    return 0;
  }
  let n = 0;
  if (!quest.participants || typeof quest.participants.entries !== "function") return 0;
  for (const [, participant] of quest.participants.entries()) {
    if (!participant || typeof participant !== "object") continue;
    await syncApprovedSubmissionsToParticipant(quest, participant);
    n++;
  }
  return n;
}

async function main() {
  loadEnv();

  const apply = process.argv.includes("--apply");
  const syncSubmissions = process.argv.includes("--sync-submissions");
  const monthlyCatchup = process.argv.includes("--monthly-catchup");
  const skipRewardStep = process.argv.includes("--skip-reward-step");
  const questId = getArg("quest-id");
  const mongoId = getArg("mongo-id");
  const dateYm = getArg("date");

  let questStatus = (getArg("status") || "active").toLowerCase();
  if (!["active", "completed", "pending", "any"].includes(questStatus)) {
    console.error("Invalid --status (use active, completed, pending, or any)");
    process.exit(1);
  }

  if (!questId && !mongoId && !dateYm) {
    console.error(
      "Usage: node bot/scripts/simulateMonthlyQuestClose.js\n" +
        "  --date YYYY-MM | --quest-id <id> | --mongo-id <ObjectId>\n" +
        "  [--status active|completed|pending|any] [--sync-submissions] [--monthly-catchup]\n" +
        "  [--skip-reward-step] [--apply]\n"
    );
    process.exit(1);
  }

  const stats = {
    questsMatched: 0,
    closed: 0,
    rewardsRun: 0,
    skippedNotActive: 0,
    skippedNoQuestId: 0,
    syncParticipants: 0,
    dryRunWouldComplete: 0,
    dryRunWouldFail: 0,
    dryRunUnchangedNonActive: 0,
    dryRunUnchangedTerminal: 0,
    dryRunWouldPromoteRewardedToCompleted: 0,
    errors: 0,
  };

  try {
    await DatabaseConnectionManager.initialize();

    const quests = await loadQuests({ questId, mongoId, dateYm, questStatus });
    stats.questsMatched = quests.length;

    if (quests.length === 0) {
      console.log("No quests matched.");
      process.exit(0);
    }

    console.log(
      `Matched ${quests.length} quest(s). mode=${apply ? "APPLY" : "DRY RUN"} statusFilter=${questStatus} syncSubmissions=${syncSubmissions} skipRewardStep=${skipRewardStep} monthlyCatchup=${monthlyCatchup}\n`
    );

    for (const quest of quests) {
      const label = `${quest.questID || quest._id} | ${String(quest.title || "").replace(/\s+/g, " ").trim() || "?"}`;
      try {
        if (quest.status !== "active") {
          stats.skippedNotActive++;
          console.log(`[skip not active] ${label} status=${quest.status}`);
          continue;
        }
        const qid = quest.questID?.trim?.();
        if (!qid) {
          stats.skippedNoQuestId++;
          console.warn(`[skip no questID] ${label}`);
          continue;
        }

        const expiredNaturally = typeof quest.checkTimeExpiration === "function" ? quest.checkTimeExpiration() : false;

        if (!apply) {
          const n =
            quest.participants && typeof quest.participants.size === "number"
              ? quest.participants.size
              : quest.participants
                ? [...quest.participants.keys()].length
                : 0;
          console.log(
            `[dry-run] ${label} | questType=${quest.questType} | participantRows=${n} | checkTimeExpiration=${expiredNaturally}`
          );
          console.log(
            `  Quest doc would → status=completed, completionReason=time_expired; then ${skipRewardStep ? "SKIP processQuestCompletion" : "run processQuestCompletion (rewards + summary)"}.`
          );
          await printDryRunQuestDetails(quest, { syncSubmissions, skipRewardStep }, stats);
          console.log("");
          continue;
        }

        if (syncSubmissions) {
          const artW =
            quest.questType === QUEST_TYPES.ART ||
            quest.questType === QUEST_TYPES.WRITING ||
            quest.questType === QUEST_TYPES.ART_WRITING;
          if (artW) {
            const sp = await syncQuestSubmissions(quest);
            stats.syncParticipants += sp;
            quest.markModified("participants");
            await quest.save();
          }
        }

        const result = await quest.checkAutoCompletion(true, { forceTimeExpired: true });

        if (!result.completed || !result.needsRewardProcessing) {
          console.log(`[no close] ${label} | reason=${result.reason || "unknown"}`);
          continue;
        }

        stats.closed++;
        console.log(`[closed] ${label} | reason=${result.reason}`);

        if (!skipRewardStep) {
          await processQuestCompletion(qid);
          stats.rewardsRun++;
          const fresh = await Quest.findOne({ questID: qid });
          if (fresh && typeof fresh.markCompletionProcessed === "function") {
            await fresh.markCompletionProcessed();
          }
          console.log(`[rewards] processQuestCompletion done for ${qid}`);
        }
      } catch (e) {
        stats.errors++;
        console.error(`[error] ${quest?.questID || quest?._id}:`, e instanceof Error ? e.message : e);
      }
    }

    if (apply && monthlyCatchup) {
      console.log("\n[monthly-catchup] Running processMonthlyQuestRewards()...\n");
      const mr = await processMonthlyQuestRewards();
      console.log("[monthly-catchup] result:", mr);
    }

    console.log("\nSummary:", stats);

    if (!apply && stats.questsMatched > 0) {
      console.log("\nRe-run with --apply to execute close + rewards.\n");
    }

    if (stats.errors > 0) {
      process.exit(1);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await DatabaseConnectionManager.closeAll();
  }
}

main();
