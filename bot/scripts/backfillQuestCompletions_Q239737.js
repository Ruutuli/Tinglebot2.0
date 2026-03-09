// ============================================================================
// backfillQuestCompletions_Q239737.js
// Purpose: Backfill missing user.quests.completions entries for quest Q239737.
//
// Default mode is DRY RUN (no writes).
// Usage:
//   node bot/scripts/backfillQuestCompletions_Q239737.js
//   node bot/scripts/backfillQuestCompletions_Q239737.js --apply
// ============================================================================
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const DatabaseConnectionManager = require("../database/connectionManager");
const Quest = require("../models/QuestModel");
const User = require("../models/UserModel");
const logger = require("../utils/logger");

const TARGET_QUEST_ID = "Q239737";

function loadEnv() {
  const env = process.env.NODE_ENV || "development";
  const rootEnvPath = path.resolve(__dirname, "..", "..", ".env");
  const envSpecificPath = path.resolve(__dirname, "..", "..", `.env.${env}`);

  if (fs.existsSync(envSpecificPath)) {
    dotenv.config({ path: envSpecificPath });
  } else if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
  } else {
    // Let downstream connection code throw a clearer error
    dotenv.config();
  }
}

function normalizeDiscordId(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  // Strip mention wrappers: <@123>, <@!123>
  const unwrapped = s.replace(/[<@!>]/g, "").trim();
  // Discord IDs are numeric strings; keep digits only if the result still looks like an ID
  const digitsOnly = unwrapped.replace(/\D/g, "");
  return digitsOnly.length >= 16 ? digitsOnly : unwrapped;
}

function isCompletedProgress(progress) {
  const p = String(progress || "").toLowerCase().trim();
  return p === "completed" || p === "rewarded";
}

function participantShouldHaveCompletion(participant, questDoc) {
  if (!participant) return false;

  if (isCompletedProgress(participant.progress)) return true;
  if (participant.completedAt || participant.rewardedAt) return true;

  try {
    if (typeof Quest.meetsRequirements === "function") {
      return Boolean(Quest.meetsRequirements(participant, questDoc));
    }
  } catch {
    // Ignore and fall through
  }

  return false;
}

function pickCompletionTimestamps(participant, questDoc) {
  const completedAt =
    participant?.completedAt ||
    participant?.rewardedAt ||
    questDoc?.completedAt ||
    new Date();
  const rewardedAt = participant?.rewardedAt || null;
  return {
    completedAt: completedAt ? new Date(completedAt) : new Date(),
    rewardedAt: rewardedAt ? new Date(rewardedAt) : null,
  };
}

function getRewardSource(participant) {
  return String(participant?.progress || "").toLowerCase().trim() === "rewarded"
    ? "dashboard_manual"
    : "pending";
}

async function main() {
  loadEnv();

  const apply = process.argv.includes("--apply");
  const dryRun = !apply;

  logger.info(
    "QUEST_BACKFILL",
    `Starting backfill for questId=${TARGET_QUEST_ID} mode=${dryRun ? "DRY_RUN" : "APPLY"}`
  );

  await DatabaseConnectionManager.initialize();

  const quest = await Quest.findOne({ questID: TARGET_QUEST_ID }).exec();
  if (!quest) {
    logger.error("QUEST_BACKFILL", `Quest not found by questID=${TARGET_QUEST_ID}`);
    await DatabaseConnectionManager.closeAll();
    process.exit(1);
  }

  if (!quest.participants || typeof quest.participants.entries !== "function") {
    logger.error("QUEST_BACKFILL", `Quest ${TARGET_QUEST_ID} has no participants map`);
    await DatabaseConnectionManager.closeAll();
    process.exit(1);
  }

  const stats = {
    scanned: 0,
    eligible: 0,
    userNotFound: 0,
    alreadyPresent: 0,
    wouldAdd: 0,
    added: 0,
    skipped: 0,
    errors: 0,
  };

  const questTitle = quest.title || `Quest ${TARGET_QUEST_ID}`;
  const questType = quest.questType || "Other";

  for (const [mapKey, participant] of quest.participants.entries()) {
    stats.scanned++;

    const discordId = normalizeDiscordId(participant?.userId || mapKey);
    if (!discordId) {
      stats.skipped++;
      continue;
    }

    const shouldHave = participantShouldHaveCompletion(participant, quest);
    if (!shouldHave) {
      stats.skipped++;
      continue;
    }
    stats.eligible++;

    try {
      const userDoc = await User.findOne({ discordId }).exec();
      if (!userDoc) {
        stats.userNotFound++;
        logger.warn(
          "QUEST_BACKFILL",
          `User not found for discordId=${discordId} (participant=${participant?.characterName || "Unknown"})`
        );
        continue;
      }

      const existing = (userDoc.quests?.completions || []).find(
        (c) => String(c?.questId || "") === TARGET_QUEST_ID
      );
      if (existing) {
        stats.alreadyPresent++;
        continue;
      }

      const { completedAt, rewardedAt } = pickCompletionTimestamps(participant, quest);
      const tokensEarned = Number(participant?.tokensEarned) || 0;
      const itemsEarned = Array.isArray(participant?.itemsEarned) ? participant.itemsEarned : [];
      const rewardSource = getRewardSource(participant);

      stats.wouldAdd++;

      if (dryRun) {
        logger.info(
          "QUEST_BACKFILL",
          `[DRY RUN] would add completion questId=${TARGET_QUEST_ID} user=${discordId} character=${participant?.characterName || "Unknown"} progress=${participant?.progress || "unknown"}`
        );
        continue;
      }

      await userDoc.recordQuestCompletion({
        questId: TARGET_QUEST_ID,
        questType,
        questTitle,
        completedAt,
        rewardedAt: rewardedAt || completedAt,
        tokensEarned,
        itemsEarned,
        rewardSource,
      });

      stats.added++;
      logger.info(
        "QUEST_BACKFILL",
        `✅ Added completion questId=${TARGET_QUEST_ID} user=${discordId} character=${participant?.characterName || "Unknown"}`
      );
    } catch (err) {
      stats.errors++;
      logger.error(
        "QUEST_BACKFILL",
        `❌ Error processing user=${discordId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  logger.info(
    "QUEST_BACKFILL",
    `Summary questId=${TARGET_QUEST_ID} scanned=${stats.scanned} eligible=${stats.eligible} alreadyPresent=${stats.alreadyPresent} userNotFound=${stats.userNotFound} ${dryRun ? "wouldAdd" : "added"}=${dryRun ? stats.wouldAdd : stats.added} skipped=${stats.skipped} errors=${stats.errors}`
  );

  await DatabaseConnectionManager.closeAll();
  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch(async (err) => {
  logger.error(
    "QUEST_BACKFILL",
    `Fatal: ${err instanceof Error ? err.message : String(err)}`
  );
  try {
    await DatabaseConnectionManager.closeAll();
  } catch {
    // ignore
  }
  process.exit(1);
});

