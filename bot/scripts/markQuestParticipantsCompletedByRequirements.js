// ============================================================================
// markQuestParticipantsCompletedByRequirements.js
//
// Re-runs Quest.meetsRequirements(participant, quest) and normalizes rows:
//   • qualifiers → progress "completed" (unless already completed/rewarded)
//   • non-qualifiers (active) → "failed"
//   • "failed" + qualifies → "completed"; "failed" + still not → unchanged
// Skips rewarded and disqualified rows. Does not downgrade "completed" if data no longer qualifies (logs warning).
//
// Does not distribute quest tokens/items. After --apply, settle rewards via the dashboard,
// the bot's processQuestCompletion / monthly job, or your usual mod workflow.
//
// Default: DRY RUN (no writes). Use --apply to save.
//
// Usage (from repo root):
//   node bot/scripts/markQuestParticipantsCompletedByRequirements.js --date 2026-04
//   node bot/scripts/markQuestParticipantsCompletedByRequirements.js --quest-id Q123456
//   node bot/scripts/markQuestParticipantsCompletedByRequirements.js --mongo-id 507f1f77bcf86cd799439011
//   node bot/scripts/markQuestParticipantsCompletedByRequirements.js --date 2026-04 --status any
//   node bot/scripts/markQuestParticipantsCompletedByRequirements.js --date 2026-04 --status any --apply
//   node bot/scripts/markQuestParticipantsCompletedByRequirements.js --quest-id Q123456 --apply
//   node bot/scripts/markQuestParticipantsCompletedByRequirements.js --quest-id Q123456 --apply --sync-submissions
//   node bot/scripts/markQuestParticipantsCompletedByRequirements.js --quest-id Q123456 --apply --no-fail
//
// Flags:
//   --apply              Write changes to MongoDB
//   --no-fail            Only promote to completed; never set progress to failed (safer if quest still open)
//   --sync-submissions   For Art / Writing / Art+Writing quests: pull ApprovedSubmission rows into the
//                        participant document before evaluating (recommended for stale submission data)
//   --status <s>         Quest document status filter: active | completed | pending | any (default: active)
//   --progress <p>       Participant rows to evaluate: active | failed | both (default: both)
//
// Requires one selector: --date, --quest-id, or --mongo-id
// ============================================================================

const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const DatabaseConnectionManager = require("../database/connectionManager");
const Quest = require("../models/QuestModel");
const questRewardModule = require("../modules/questRewardModule");
const logger = require("../utils/logger");

const { meetsRequirements } = Quest;
const { syncApprovedSubmissionsToParticipant, recordQuestCompletionSafeguard, QUEST_TYPES } =
  questRewardModule;

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

/** One-line title for logs (no newlines). */
function questTitleOneLine(quest) {
  return String(quest?.title ?? "")
    .replace(/\s+/g, " ")
    .trim() || "?";
}

/** Standard row prefix: ID, title, character, user. */
function participantRowPrefix(quest, participant) {
  const id = quest.questID || "?";
  const title = questTitleOneLine(quest);
  const char = participant.characterName || "?";
  const uid = participant.userId || "?";
  return `${id} | ${title} | ${char} | userId=${uid}`;
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

function applyMarkCompleted(participant) {
  participant.progress = "completed";
  participant.completedAt = new Date();
  participant.updatedAt = new Date();
  participant.completionProcessed = false;
  participant.lastCompletionCheck = new Date();
  participant.questSubmissionInfo = null;
}

function applyMarkFailed(participant) {
  participant.progress = "failed";
  participant.updatedAt = new Date();
  participant.lastCompletionCheck = new Date();
}

function shouldConsiderParticipantProgress(progressRaw, mode) {
  const p = String(progressRaw || "active").toLowerCase();
  if (mode === "both") return p === "active" || p === "failed";
  if (mode === "failed") return p === "failed";
  return p === "active";
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

async function main() {
  loadEnv();

  const apply = process.argv.includes("--apply");
  const noFail = process.argv.includes("--no-fail");
  const syncSubmissions = process.argv.includes("--sync-submissions");
  const questId = getArg("quest-id");
  const mongoId = getArg("mongo-id");
  const dateYm = getArg("date");
  let questStatus = (getArg("status") || "active").toLowerCase();
  if (!["active", "completed", "pending", "any"].includes(questStatus)) {
    console.error("Invalid --status (use active, completed, pending, or any)");
    process.exit(1);
  }
  let progressMode = (getArg("progress") || "both").toLowerCase();
  if (!["active", "failed", "both"].includes(progressMode)) {
    console.error("Invalid --progress (use active, failed, or both)");
    process.exit(1);
  }

  if (!questId && !mongoId && !dateYm) {
    console.error(
      "Usage: node bot/scripts/markQuestParticipantsCompletedByRequirements.js\n" +
        "  --date YYYY-MM | --quest-id <id> | --mongo-id <ObjectId>\n" +
        "  [--status active|completed|pending|any] [--progress active|failed|both]\n" +
        "  [--sync-submissions] [--no-fail] [--apply]\n"
    );
    process.exit(1);
  }

  let stats = {
    questsLoaded: 0,
    questsChanged: 0,
    participantsChecked: 0,
    wouldComplete: 0,
    completedApplied: 0,
    wouldFail: 0,
    failedApplied: 0,
    skippedRewardedDisqualified: 0,
    skippedCompletedMismatch: 0,
    syncRuns: 0,
    errors: 0,
  };

  try {
    await DatabaseConnectionManager.initialize();

    const quests = await loadQuests({
      questId,
      mongoId,
      dateYm,
      questStatus,
    });

    stats.questsLoaded = quests.length;
    if (quests.length === 0) {
      logger.info("QUEST_MARK", "No quests matched the filter.");
      process.exit(0);
    }

    logger.info(
      "QUEST_MARK",
      `Matched ${quests.length} quest(s). Mode=${apply ? "APPLY" : "DRY RUN"} progress=${progressMode} questStatus=${questStatus} syncSubmissions=${syncSubmissions} failNonQualifiers=${!noFail}`
    );

    for (const quest of quests) {
      try {
        let questTouched = false;

        if (!quest.participants || typeof quest.participants.entries !== "function") {
          logger.warn("QUEST_MARK", `Skip quest ${quest.questID}: no participants map`);
          continue;
        }

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

        for (const [, participant] of quest.participants.entries()) {
          if (!participant || typeof participant !== "object") continue;

          const pProg = String(participant.progress || "active").toLowerCase();
          if (pProg === "rewarded" || pProg === "disqualified") {
            stats.skippedRewardedDisqualified++;
            continue;
          }

          if (pProg === "completed") {
            if (syncSubmissions) {
              const qt = quest.questType;
              if (qt === QUEST_TYPES.ART || qt === QUEST_TYPES.WRITING || qt === QUEST_TYPES.ART_WRITING) {
                await syncApprovedSubmissionsToParticipant(quest, participant);
                stats.syncRuns++;
              }
            }
            const okDone = meetsRequirements(participant, quest, reqOpts);
            if (!okDone) {
              stats.skippedCompletedMismatch++;
              const label = `${participantRowPrefix(quest, participant)} | progress=completed but meetsRequirements=false (not changed — fix manually if needed)`;
              console.warn(`[warn] ${label}`);
            }
            continue;
          }

          if (!shouldConsiderParticipantProgress(participant.progress, progressMode)) continue;

          stats.participantsChecked++;

          if (syncSubmissions) {
            const qt = quest.questType;
            if (qt === QUEST_TYPES.ART || qt === QUEST_TYPES.WRITING || qt === QUEST_TYPES.ART_WRITING) {
              await syncApprovedSubmissionsToParticipant(quest, participant);
              stats.syncRuns++;
            }
          }

          const ok = meetsRequirements(participant, quest, reqOpts);

          if (ok) {
            stats.wouldComplete++;
            const label = `${participantRowPrefix(quest, participant)} | was=${participant.progress}`;

            if (apply) {
              applyMarkCompleted(participant);
              await recordQuestCompletionSafeguard(participant, quest);
              questTouched = true;
              stats.completedApplied++;
              logger.success("QUEST_MARK", `Marked completed: ${label}`);
            } else {
              console.log(`[would complete] ${label}`);
            }
            continue;
          }

          if (noFail) continue;

          if (pProg === "failed") {
            continue;
          }

          if (pProg === "active") {
            stats.wouldFail++;
            const label = `${participantRowPrefix(quest, participant)} | was=active`;
            if (apply) {
              applyMarkFailed(participant);
              questTouched = true;
              stats.failedApplied++;
              logger.info("QUEST_MARK", `Marked failed: ${label}`);
            } else {
              console.log(`[would fail] ${label}`);
            }
          }
        }

        if (questTouched) {
          quest.markModified("participants");
          await quest.save();
          stats.questsChanged++;
        }
      } catch (e) {
        stats.errors++;
        logger.error(
          "QUEST_MARK",
          `Quest ${quest?.questID || quest?._id}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    logger.info(
      "QUEST_MARK",
      `Done. quests=${stats.questsLoaded} checkedRows=${stats.participantsChecked} wouldComplete=${stats.wouldComplete} wouldFail=${stats.wouldFail} completedApplied=${stats.completedApplied} failedApplied=${stats.failedApplied} questsSaved=${stats.questsChanged} syncRuns=${stats.syncRuns} skipRewardedDisq=${stats.skippedRewardedDisqualified} skipCompletedMismatch=${stats.skippedCompletedMismatch} errors=${stats.errors}`
    );

    if (!apply && (stats.wouldComplete > 0 || stats.wouldFail > 0)) {
      console.log("\nRe-run with --apply to write these changes.\n");
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
