// ============================================================================
// grantQuestItemRewards_Q915539_Q915538.js
// One-off: grant quest item rewards for Q915539, Q915538, and Q915541 to participants
// who finished the quest but have no itemsEarned on the quest document (e.g.
// dashboard "mark complete" only paid tokens).
//
// Default: DRY RUN (no inventory writes).
// Usage (from repo root):
//   node bot/scripts/grantQuestItemRewards_Q915539_Q915538.js
//   node bot/scripts/grantQuestItemRewards_Q915539_Q915538.js --apply
//
// Optional: grant even if itemsEarned is already set (dangerous — duplicates inventory):
//   node bot/scripts/grantQuestItemRewards_Q915539_Q915538.js --apply --force
// ============================================================================

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const DatabaseConnectionManager = require("../database/connectionManager");
const Quest = require("../models/QuestModel");
const logger = require("../utils/logger");
const { distributeItems } = require("../modules/questRewardModule");

const TARGET_QUEST_IDS = ["Q915539", "Q915538", "Q915541"];

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

function questHasItemRewards(quest) {
  return (
    (quest.itemRewards && quest.itemRewards.length > 0) ||
    (quest.itemReward && Number(quest.itemRewardQty) > 0)
  );
}

function isFinishedProgress(progress) {
  const p = String(progress || "").toLowerCase().trim();
  return p === "completed" || p === "rewarded";
}

function itemsEarnedEmpty(participant) {
  const ie = participant?.itemsEarned;
  return !Array.isArray(ie) || ie.length === 0;
}

function expectedItemsSnapshot(quest) {
  if (quest.itemRewards && quest.itemRewards.length > 0) {
    return quest.itemRewards.map((r) => ({
      name: r.name,
      quantity: r.quantity,
    }));
  }
  if (quest.itemReward && Number(quest.itemRewardQty) > 0) {
    return [{ name: quest.itemReward, quantity: quest.itemRewardQty || 1 }];
  }
  return [];
}

async function processQuest(questId, apply, force) {
  const quest = await Quest.findOne({ questID: questId }).exec();
  if (!quest) {
    logger.error("QUEST_ITEM_GRANT", `Quest not found: ${questId}`);
    return { errors: 1, granted: 0, skipped: 0, dryListed: 0 };
  }

  if (!questHasItemRewards(quest)) {
    logger.warn(
      "QUEST_ITEM_GRANT",
      `Quest ${questId} has no itemReward / itemRewards; nothing to grant`
    );
    return { errors: 0, granted: 0, skipped: 0, dryListed: 0 };
  }

  if (!quest.participants || typeof quest.participants.entries !== "function") {
    logger.error("QUEST_ITEM_GRANT", `Quest ${questId} has no participants map`);
    return { errors: 1, granted: 0, skipped: 0, dryListed: 0 };
  }

  const expected = expectedItemsSnapshot(quest);
  let granted = 0;
  let skipped = 0;
  let dryListed = 0;
  let errors = 0;

  for (const [, participant] of quest.participants.entries()) {
    if (!participant?.characterName || !participant?.userId) {
      logger.warn(
        "QUEST_ITEM_GRANT",
        `[${questId}] skip participant missing characterName/userId`
      );
      skipped++;
      continue;
    }

    if (!isFinishedProgress(participant.progress)) {
      skipped++;
      continue;
    }

    if (!force && !itemsEarnedEmpty(participant)) {
      skipped++;
      continue;
    }

    if (!apply) {
      dryListed++;
      logger.info(
        "QUEST_ITEM_GRANT",
        `[DRY RUN] ${questId} ${participant.characterName} (${participant.userId}) would receive: ${JSON.stringify(expected)}`
      );
      continue;
    }

    try {
      const itemResult = await distributeItems(quest, participant);
      if (!itemResult.success) {
        errors++;
        logger.error(
          "QUEST_ITEM_GRANT",
          `[${questId}] ${participant.characterName}: ${itemResult.error || "distributeItems failed"}`
        );
        continue;
      }

      if (itemResult.itemsDistributed && itemResult.itemsDistributed.length > 0) {
        participant.itemsEarned = itemResult.itemsDistributed;
      } else if (quest.itemRewards && quest.itemRewards.length > 0) {
        participant.itemsEarned = quest.itemRewards;
      } else if (quest.itemReward) {
        participant.itemsEarned = [
          { name: quest.itemReward, quantity: quest.itemRewardQty || 1 },
        ];
      } else {
        participant.itemsEarned = [];
      }
      participant.rewardProcessed = true;
      participant.lastRewardCheck = new Date();

      granted++;
      logger.info(
        "QUEST_ITEM_GRANT",
        `✅ ${questId} ${participant.characterName}: ${JSON.stringify(itemResult.itemsDistributed || [])}`
      );
      if (itemResult.errors && itemResult.errors.length) {
        logger.warn(
          "QUEST_ITEM_GRANT",
          `[${questId}] ${participant.characterName} partial warnings: ${itemResult.errors.join("; ")}`
        );
      }
    } catch (err) {
      errors++;
      logger.error(
        "QUEST_ITEM_GRANT",
        `[${questId}] ${participant.characterName}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (apply && granted > 0) {
    await quest.save();
    logger.info("QUEST_ITEM_GRANT", `Saved quest document ${questId}`);
  }

  return { errors, granted, skipped, dryListed };
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");
  const dryRun = !apply;

  logger.info(
    "QUEST_ITEM_GRANT",
    `Targets: ${TARGET_QUEST_IDS.join(", ")} mode=${dryRun ? "DRY_RUN" : "APPLY"} force=${force}`
  );

  await DatabaseConnectionManager.initialize();

  let totalErrors = 0;
  let totalGranted = 0;
  let totalSkipped = 0;
  let totalDryListed = 0;

  for (const questId of TARGET_QUEST_IDS) {
    const s = await processQuest(questId, apply, force);
    totalErrors += s.errors;
    totalGranted += s.granted;
    totalSkipped += s.skipped;
    totalDryListed += s.dryListed;
  }

  logger.info(
    "QUEST_ITEM_GRANT",
    `Done apply=${apply} granted=${totalGranted} dryListed=${totalDryListed} skipped=${totalSkipped} errors=${totalErrors}`
  );

  await DatabaseConnectionManager.closeAll();
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch(async (err) => {
  logger.error(
    "QUEST_ITEM_GRANT",
    `Fatal: ${err instanceof Error ? err.message : String(err)}`
  );
  try {
    await DatabaseConnectionManager.closeAll();
  } catch {
    // ignore
  }
  process.exit(1);
});
