// ============================================================================
// auditQuestParticipantRewardConsistency.js
//
// Scans Quest documents for participant rows where token payout and progress
// disagree (e.g. progress "completed" but tokensEarned > 0 — the bot bug).
//
// Default: DRY RUN (read-only). Writes only with --apply.
//
// Usage:
//   node bot/scripts/auditQuestParticipantRewardConsistency.js
//   node bot/scripts/auditQuestParticipantRewardConsistency.js --apply
//   node bot/scripts/auditQuestParticipantRewardConsistency.js --verify-tx --limit 30
//   node bot/scripts/auditQuestParticipantRewardConsistency.js --verify-empty-rewarded --limit 50
//
// Flags:
//   --apply                  Set progress to "rewarded" when completed + tokensEarned > 0
//   --verify-tx              For paid_wrong_progress rows only, check TokenTransaction
//   --verify-empty-rewarded  For rewarded + no tokens/items on quest doc, check if Sheikah still has quest_reward tx
//   --limit <n>              Cap --verify-* lookups (default 40)
//   --json                   One JSON object per line for paid_wrong_progress mismatches only
// ============================================================================
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const DatabaseConnectionManager = require("../database/connectionManager");
const Quest = require("../models/QuestModel");
const TokenTransaction = require("../models/TokenTransactionModel");
const logger = require("../utils/logger");

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

function parseNumberFlag(name, defaultValue) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return defaultValue;
  const raw = process.argv[idx + 1];
  if (raw == null) return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.max(0, Math.floor(n));
}

function iterParticipants(participants) {
  if (!participants) return [];
  if (participants instanceof Map) {
    return Array.from(participants.entries());
  }
  if (typeof participants === "object") {
    return Object.entries(participants);
  }
  return [];
}

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function summarizeParticipant(p) {
  if (!p || typeof p !== "object") return {};
  return {
    characterName: p.characterName,
    userId: p.userId,
    progress: p.progress,
    tokensEarned: p.tokensEarned,
    rewardedAt: p.rewardedAt,
    completedAt: p.completedAt,
    itemsEarnedCount: Array.isArray(p.itemsEarned) ? p.itemsEarned.length : 0,
  };
}

/**
 * paid_but_wrong_progress: bot/dashboard paid tokens but progress still "completed"
 */
function isPaidWrongProgress(p) {
  if (!p || typeof p !== "object") return false;
  const prog = String(p.progress || "").toLowerCase();
  const te = Number(p.tokensEarned);
  return prog === "completed" && Number.isFinite(te) && te > 0;
}

/**
 * rewarded badge but no token/item record (informational; may be 0-token quests)
 */
function isRewardedWithoutRecordedLoot(p) {
  if (!p || typeof p !== "object") return false;
  const prog = String(p.progress || "").toLowerCase();
  if (prog !== "rewarded") return false;
  const te = Number(p.tokensEarned);
  const hasTokens = Number.isFinite(te) && te > 0;
  const hasItems = Array.isArray(p.itemsEarned) && p.itemsEarned.length > 0;
  return !hasTokens && !hasItems;
}

async function main() {
  loadEnv();

  const apply = process.argv.includes("--apply");
  const verifyTx = process.argv.includes("--verify-tx");
  const verifyEmptyRewarded = process.argv.includes("--verify-empty-rewarded");
  const asJson = process.argv.includes("--json");
  const txLimit = parseNumberFlag("limit", 40);

  await DatabaseConnectionManager.initialize();

  const stats = {
    questsScanned: 0,
    participantsScanned: 0,
    paidWrongProgress: 0,
    rewardedNoLoot: 0,
    questsFixed: 0,
    participantsFixed: 0,
    verifyTxChecked: 0,
    verifyTxFound: 0,
    verifyEmptyChecked: 0,
    verifyEmptyWithTx: 0,
    verifyEmptyNoTx: 0,
    errors: 0,
  };

  const mismatches = [];
  const rewardedNoLootSamples = [];
  /** @type {Array<{ questId: string, questTitle: string, characterName: string, userId: string }>} */
  const rewardedNoLootAll = [];

  try {
    const cursor = Quest.find(
      {},
      { questID: 1, title: 1, status: 1, participants: 1 }
    )
      .lean()
      .cursor();

    for await (const q of cursor) {
      stats.questsScanned++;
      const entries = iterParticipants(q.participants);
      for (const [mapKey, p] of entries) {
        stats.participantsScanned++;
        if (isPaidWrongProgress(p)) {
          stats.paidWrongProgress++;
          mismatches.push({
            kind: "paid_wrong_progress",
            questId: q.questID,
            questTitle: q.title,
            questStatus: q.status,
            mapKey,
            ...summarizeParticipant(p),
          });
        } else if (isRewardedWithoutRecordedLoot(p)) {
          stats.rewardedNoLoot++;
          const row = {
            questId: q.questID,
            questTitle: q.title,
            characterName: p.characterName,
            userId: p.userId,
          };
          rewardedNoLootAll.push(row);
          if (rewardedNoLootSamples.length < 20) {
            rewardedNoLootSamples.push(row);
          }
        }
      }
    }

    if (asJson) {
      for (const row of mismatches) {
        console.log(JSON.stringify(row));
      }
    } else {
      logger.info(
        "QUEST_AUDIT",
        `Scanned ${stats.questsScanned} quests, ${stats.participantsScanned} participant rows`
      );
      logger.info(
        "QUEST_AUDIT",
        `paid_wrong_progress (completed + tokensEarned>0): ${stats.paidWrongProgress}`
      );
      logger.info(
        "QUEST_AUDIT",
        `rewarded_no_tokens_no_items (informational): ${stats.rewardedNoLoot}`
      );

      if (rewardedNoLootSamples.length && !asJson) {
        console.log("\n--- rewarded but no tokens/items on participant (sample up to 20) ---\n");
        rewardedNoLootSamples.forEach((row, i) => {
          console.log(
            `${i + 1}. ${row.questId || "?"} | ${row.characterName || "?"} | userId=${row.userId}`
          );
        });
        console.log(
          "(Often: 0-token quest, item-only data stored elsewhere, or manual dashboard edge case.)\n"
        );
      }

      if (!asJson) {
        console.log(
          "\n--- How to read this ---\n" +
            `• paid_wrong_progress = 0 means: no participant has BOTH progress "completed" AND tokensEarned>0 on the quest document.\n` +
            `• rewarded_no_tokens_no_items = ${stats.rewardedNoLoot}: progress is already "rewarded" but the quest row has no tokensEarned and no itemsEarned.\n` +
            "  That is normal for true 0-token quests, OR it can mean tokens were paid (Sheikah) but never copied onto the quest participant.\n" +
            "  To check: node bot/scripts/auditQuestParticipantRewardConsistency.js --verify-empty-rewarded --limit 100\n\n"
        );
      }

      if (mismatches.length && !asJson) {
        console.log("\n--- paid_wrong_progress (first 50) ---\n");
        mismatches.slice(0, 50).forEach((row, i) => {
          console.log(
            `${i + 1}. ${row.questId || "?"} | ${row.characterName || "?"} | userId=${row.userId} | tokens=${row.tokensEarned} | mapKey=${row.mapKey}`
          );
        });
        if (mismatches.length > 50) {
          console.log(`... and ${mismatches.length - 50} more (use --json for full list)\n`);
        }
      }
    }

    if (verifyEmptyRewarded && rewardedNoLootAll.length && !asJson) {
      let checked = 0;
      for (const row of rewardedNoLootAll) {
        if (checked >= txLimit) break;
        checked++;
        stats.verifyEmptyChecked++;
        const uid = String(row.userId || "").trim();
        if (!uid) continue;
        const title = String(row.questTitle || "").trim();
        const descRegex = title
          ? new RegExp(escapeRegex(`Quest: ${title}`), "i")
          : /quest_reward/i;
        const found = await TokenTransaction.findOne({
          userId: uid,
          category: "quest_reward",
          description: descRegex,
        })
          .sort({ timestamp: -1 })
          .lean();
        if (found) {
          stats.verifyEmptyWithTx++;
          console.log(
            `empty-rewarded + TX: ${row.questId} | ${row.characterName} | userId=${uid} | ledger amount=${found.amount} | desc snippet=${String(found.description || "").slice(0, 60)}`
          );
        } else {
          stats.verifyEmptyNoTx++;
          console.log(
            `empty-rewarded no TX: ${row.questId} | ${row.characterName} | userId=${uid} (no matching quest_reward for this quest title)`
          );
        }
      }
      if (rewardedNoLootAll.length > txLimit) {
        console.log(`\n(--verify-empty-rewarded capped at --limit ${txLimit}; ${rewardedNoLootAll.length} total in this bucket)\n`);
      }
      logger.info(
        "QUEST_AUDIT",
        `--verify-empty-rewarded: checked ${stats.verifyEmptyChecked}, had ledger tx: ${stats.verifyEmptyWithTx}, no tx: ${stats.verifyEmptyNoTx}`
      );
    }

    if (verifyTx && mismatches.length) {
      let checked = 0;
      for (const row of mismatches) {
        if (checked >= txLimit) break;
        checked++;
        stats.verifyTxChecked++;
        const uid = String(row.userId || "").trim();
        if (!uid) continue;
        const title = String(row.questTitle || "").trim();
        const descRegex = title
          ? new RegExp(escapeRegex(`Quest: ${title}`), "i")
          : /quest_reward/i;
        const found = await TokenTransaction.findOne({
          userId: uid,
          category: "quest_reward",
          description: descRegex,
        })
          .sort({ timestamp: -1 })
          .lean();
        if (found) stats.verifyTxFound++;
        if (!asJson) {
          console.log(
            `verify-tx: ${row.questId} ${row.characterName} userId=${uid} -> ${found ? `tx amount=${found.amount}` : "NO MATCHING TX"}`
          );
        }
      }
      if (!asJson) {
        logger.info(
          "QUEST_AUDIT",
          `--verify-tx: checked ${stats.verifyTxChecked}, found matching quest_reward tx: ${stats.verifyTxFound}`
        );
      }
    }

    if (apply && stats.paidWrongProgress > 0) {
      const byMongoId = new Map();
      for (const row of mismatches) {
        if (row.kind !== "paid_wrong_progress") continue;
        const quest = await Quest.findOne({ questID: row.questId }).exec();
        if (!quest) {
          stats.errors++;
          logger.error("QUEST_AUDIT", `Quest not found for questID=${row.questId}`);
          continue;
        }
        const id = String(quest._id);
        if (!byMongoId.has(id)) byMongoId.set(id, quest);
      }

      for (const quest of byMongoId.values()) {
        let changed = false;
        for (const [mapKey, p] of quest.participants.entries()) {
          if (!isPaidWrongProgress(p)) continue;
          p.progress = "rewarded";
          if (!p.rewardedAt) {
            p.rewardedAt = p.completedAt ? new Date(p.completedAt) : new Date();
          }
          changed = true;
          stats.participantsFixed++;
        }
        if (changed) {
          quest.markModified("participants");
          await quest.save();
          stats.questsFixed++;
        }
      }

      logger.success(
        "QUEST_AUDIT",
        `APPLY: updated ${stats.participantsFixed} participants across ${stats.questsFixed} quests`
      );
    } else if (!apply && stats.paidWrongProgress > 0) {
      logger.info(
        "QUEST_AUDIT",
        "Re-run with --apply to set progress to rewarded for rows above (safe: only when tokensEarned > 0)"
      );
    }
  } catch (e) {
    stats.errors++;
    logger.error("QUEST_AUDIT", e instanceof Error ? e.message : String(e));
    console.error(e);
  } finally {
    await DatabaseConnectionManager.closeAll();
  }

  process.exit(stats.errors > 0 ? 1 : 0);
}

main();
