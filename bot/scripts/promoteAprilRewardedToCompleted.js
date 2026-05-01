// ============================================================================
// promoteAprilRewardedToCompleted.js
//
// Sets participant progress "rewarded" → "completed" only (plus updatedAt, and
// rewardProcessed=true when missing so the dashboard shows terminal "Complete").
//
// Default filter: quests with status "completed" AND date that looks like April
// (word "April" OR numeric April like 2026-04, 04/2026, etc.).
// Default: dry run. Requires --apply to write.
//
// Usage (repo root):
//   node bot/scripts/promoteAprilRewardedToCompleted.js
//   node bot/scripts/promoteAprilRewardedToCompleted.js --apply
//   node bot/scripts/promoteAprilRewardedToCompleted.js --apply --year 2026
//   node bot/scripts/promoteAprilRewardedToCompleted.js --apply --quest-id Q488150
//   node bot/scripts/promoteAprilRewardedToCompleted.js --apply --quest-id Q111 --quest-id Q222
//   node bot/scripts/promoteAprilRewardedToCompleted.js --apply --all-completed
//   node bot/scripts/promoteAprilRewardedToCompleted.js --apply --include-open --quest-id Q488150
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

function parseQuestIds(argv) {
  const ids = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const mEq = /^--quest-id=(Q\d+)$/i.exec(a);
    if (mEq) {
      ids.add(mEq[1].toUpperCase());
      continue;
    }
    if (a === "--quest-id" && argv[i + 1] && /^Q\d+$/i.test(argv[i + 1])) {
      ids.add(argv[i + 1].toUpperCase());
      i++;
    }
    if (/^Q\d+$/i.test(a) && !["--apply", "--include-open", "--all-completed"].includes(a)) {
      ids.add(a.toUpperCase());
    }
  }
  return [...ids];
}

/** Match common dashboard/bot month labels for April. */
function aprilDateMongoOr(year) {
  if (year && /^\d{4}$/.test(year)) {
    const y = year;
    return {
      $or: [
        { date: new RegExp(`April\\s*,?\\s*${y}`, "i") },
        { date: new RegExp(`\\b${y}-04\\b`) },
        { date: new RegExp(`\\b04[/-]${y}\\b`) },
        { date: new RegExp(`\\b${y}[/-]04\\b`) },
      ],
    };
  }
  return {
    $or: [
      { date: /April/i },
      { date: /\b\d{4}-04\b/ },
      { date: /\b04[/-]\d{4}\b/ },
      { date: /\b\d{4}[/-]04\b/ },
    ],
  };
}

function countRewardedParticipants(quest) {
  if (!quest.participants || typeof quest.participants.entries !== "function") {
    return 0;
  }
  let n = 0;
  for (const [, p] of quest.participants.entries()) {
    if (!p || typeof p !== "object") continue;
    if (String(p.progress || "").toLowerCase() === "rewarded") n += 1;
  }
  return n;
}

function promoteRewardedToCompletedOnDoc(quest) {
  if (!quest.participants || typeof quest.participants.entries !== "function") {
    return 0;
  }
  const now = new Date();
  let n = 0;
  for (const [, p] of quest.participants.entries()) {
    if (!p || typeof p !== "object") continue;
    if (String(p.progress || "").toLowerCase() !== "rewarded") continue;
    p.progress = "completed";
    p.updatedAt = now;
    if (p.rewardProcessed !== true) {
      p.rewardProcessed = true;
    }
    n += 1;
  }
  return n;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const includeOpen = process.argv.includes("--include-open");
  const allCompleted = process.argv.includes("--all-completed");

  const yearEq = process.argv.find((a) => a.startsWith("--year="));
  const yearFromEq = yearEq ? yearEq.split("=").slice(1).join("=").trim() : null;
  const yearIdx = process.argv.indexOf("--year");
  const year =
    yearFromEq ||
    (yearIdx >= 0 && process.argv[yearIdx + 1] && !process.argv[yearIdx + 1].startsWith("--")
      ? process.argv[yearIdx + 1].trim()
      : null);

  const questIds = parseQuestIds(process.argv);

  if (allCompleted && includeOpen && questIds.length === 0) {
    console.error(
      "Refusing --all-completed with --include-open without --quest-id (would scan every open quest)."
    );
    process.exit(1);
  }

  /** @type {Record<string, unknown>} */
  const query = {};

  if (questIds.length > 0) {
    query.questID = { $in: questIds };
  } else if (allCompleted) {
    /* date unrestricted */
  } else {
    Object.assign(query, aprilDateMongoOr(year));
  }

  if (!includeOpen) {
    query.status = "completed";
  }

  await DatabaseConnectionManager.initialize();

  try {
    const quests = await Quest.find(query).sort({ questID: 1 }).exec();

    const filterDesc = questIds.length
      ? `questID in [${questIds.join(", ")}]`
      : allCompleted
        ? "ALL dates (completed quests only unless --include-open)"
        : `April-like date${year ? ` (${year})` : ""}`;

    console.log(
      `\nQuests: ${quests.length} (${filterDesc}, status=${includeOpen ? "any" : "completed"}) [${
        apply ? "APPLY" : "DRY RUN"
      }]\n`
    );

    let totalRows = 0;
    let questsTouched = 0;
    const withRewarded = quests.filter((q) => countRewardedParticipants(q) > 0);

    for (const quest of quests) {
      const n = countRewardedParticipants(quest);
      if (n === 0) continue;
      totalRows += n;
      const label = `${quest.questID || "?"} — date=${JSON.stringify(quest.date)} — ${String(
        quest.title || ""
      ).slice(0, 48)}`;
      console.log(`${label}\n  rewarded rows: ${n}${apply ? "" : " (no write)"}`);
      if (apply) {
        promoteRewardedToCompletedOnDoc(quest);
        quest.markModified("participants");
        await quest.save();
        questsTouched += 1;
        console.log(`  saved`);
      }
    }

    console.log(
      `\nDone: ${totalRows} participant row(s) ${apply ? "updated" : "would update"} across ${
        apply ? questsTouched : withRewarded.length
      } quest(s).`
    );
    if (!apply && totalRows > 0) {
      console.log("Re-run with --apply to write.\n");
    }
    if (totalRows === 0 && quests.length > 0) {
      console.log(
        "No rewarded rows on matching quests. If you expected some, try --quest-id Q… or --all-completed.\n"
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
