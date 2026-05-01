// ============================================================================
// runQuestRewardsOnly.js
//
// Runs the normal bot reward pipeline for one quest only:
//   processQuestCompletion(questID) → tokens + items + participant rows +
//   user quest tracking + batched "you were rewarded" notifications (if any).
//
// Does NOT simulate month-end, expiry, or force participant completed/failed.
// Quest must exist and status must be "active" or "completed".
//
// Usage (repo root):
//   node bot/scripts/runQuestRewardsOnly.js Q488150 --apply
//
// Flags:
//   --apply              Required to actually run (otherwise prints usage)
//   --no-summary         Do not post the quest completion summary embed (tokens/items still apply)
//   --base-reward-only   RP / Interactive+RP only: skip Entertainer job bonus (+100/participant).
//                        Use when you want exactly the quest token line (e.g. 300) with no Ballad add-on.
//
// Env (optional):
//   SKIP_QUEST_COMPLETION_SUMMARY=1  Same effect as --no-summary (set before requiring modules)
//   SKIP_ENTERTAINER_QUEST_BONUS=1   Same effect as --base-reward-only
// ============================================================================

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const DatabaseConnectionManager = require("../database/connectionManager");
const Quest = require("../models/QuestModel");

function loadEnv() {
  const env = process.env.NODE_ENV || "development";
  const rootEnvPath = path.resolve(__dirname, "..", "..", ".env");
  const envSpecificPath = path.resolve(__dirname, "..", "..", `.env.${env}`);
  if (fs.existsSync(envSpecificPath)) dotenv.config({ path: envSpecificPath });
  else if (fs.existsSync(rootEnvPath)) dotenv.config({ path: rootEnvPath });
  else dotenv.config();
}

async function main() {
  loadEnv();

  const apply = process.argv.includes("--apply");
  const noSummary = process.argv.includes("--no-summary");
  const baseRewardOnly = process.argv.includes("--base-reward-only");
  if (noSummary) {
    process.env.SKIP_QUEST_COMPLETION_SUMMARY = "1";
  }
  if (baseRewardOnly) {
    process.env.SKIP_ENTERTAINER_QUEST_BONUS = "1";
  }

  const questIdArg = process.argv.find((a) => /^Q\d+$/i.test(a));
  if (!questIdArg || !apply) {
    console.error(
      "Usage:\n" +
        "  node bot/scripts/runQuestRewardsOnly.js Q488150 --apply\n\n" +
        "Optional:\n" +
        "  --no-summary         Skip Discord quest completion summary embed\n" +
        "  --base-reward-only   No Entertainer +100 bonus on RP quests (300 stays 300)\n\n" +
        "Requires --apply so rewards are not run accidentally."
    );
    process.exit(1);
  }

  const questID = questIdArg.toUpperCase();

  await DatabaseConnectionManager.initialize();

  try {
    const { processQuestCompletion } = require("../modules/questRewardModule");

    const quest = await Quest.findOne({ questID }).exec();
    if (!quest) {
      console.error(`Quest not found: ${questID}`);
      process.exit(1);
    }

    const n =
      quest.participants && typeof quest.participants.size === "number"
        ? quest.participants.size
        : 0;

    console.log(
      `\n${questID} — "${quest.title || "?"}" status=${quest.status} participants=${n}\n` +
        `${baseRewardOnly ? "(Entertainer bonus OFF) " : ""}` +
        `Running processQuestCompletion (see bot logs for per-user outcome)…\n`
    );

    if (n === 0) {
      console.warn(
        "No participants on this quest document — processQuestCompletion will exit early. Fix roster/signups in DB first."
      );
    }

    await processQuestCompletion(questID);

    console.log(`\nDone: processQuestCompletion finished for ${questID}`);
  } finally {
    await DatabaseConnectionManager.closeAll();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
