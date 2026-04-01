// ============================================================================
// checkQuestCompletedAgainstLedger.js
//
// For one quest (by questID e.g. Q915540), list participants with progress
// "completed" and check TokenTransaction for category quest_reward matching
// the quest title (exact description "Quest: <title>" first, then looser match).
//
// Usage:
//   node bot/scripts/checkQuestCompletedAgainstLedger.js Q915540
//   node bot/scripts/checkQuestCompletedAgainstLedger.js Q915540 --include-failed
// ============================================================================
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const DatabaseConnectionManager = require("../database/connectionManager");
const Quest = require("../models/QuestModel");
const TokenTransaction = require("../models/TokenTransactionModel");

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

/**
 * @param {string} userId
 * @param {string} questTitle
 */
async function findLedgerQuestReward(userId, questTitle) {
  const title = String(questTitle || "").trim();
  if (!userId || !title) return { tx: null, how: "none" };

  const exactPat = new RegExp(`^Quest:\\s*${escapeRegex(title)}\\s*$`, "i");
  let tx = await TokenTransaction.findOne({
    userId,
    category: "quest_reward",
    type: "earned",
    description: exactPat,
  })
    .sort({ timestamp: -1 })
    .lean();
  if (tx) return { tx, how: "exact_title" };

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
    if (tx) return { tx, how: "title_without_trailing_punct" };
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
  if (tx) return { tx, how: "description_contains_title" };

  const anyQuest = await TokenTransaction.findOne({
    userId,
    category: "quest_reward",
    type: "earned",
  })
    .sort({ timestamp: -1 })
    .lean();
  return { tx: null, how: "none", latestQuestReward: anyQuest };
}

async function main() {
  loadEnv();
  const questIdArg = process.argv.find((a) => /^Q\d+$/i.test(a));
  const includeFailed = process.argv.includes("--include-failed");

  if (!questIdArg) {
    console.error("Usage: node bot/scripts/checkQuestCompletedAgainstLedger.js Q915540 [--include-failed]");
    process.exit(1);
  }

  const questID = questIdArg.toUpperCase();
  await DatabaseConnectionManager.initialize();

  try {
    const quest = await Quest.findOne({ questID }).lean();
    if (!quest) {
      console.error(`Quest not found: ${questID}`);
      process.exit(1);
    }

    const title = quest.title || "";
    console.log(`\nQuest ${questID} — "${title}"`);
    console.log(`status: ${quest.status}\n`);

    const entries = quest.participants
      ? quest.participants instanceof Map
        ? Array.from(quest.participants.entries())
        : Object.entries(quest.participants)
      : [];

    const want = (p) => {
      const prog = String(p?.progress || "").toLowerCase();
      if (prog === "completed") return true;
      if (includeFailed && prog === "failed") return true;
      return false;
    };

    const rows = [];
    for (const [, p] of entries) {
      if (!p || typeof p !== "object") continue;
      if (!want(p)) continue;
      const uid = normalizeUserId(p.userId);
      const { tx, how, latestQuestReward } = await findLedgerQuestReward(uid, title);
      rows.push({
        characterName: p.characterName,
        userId: uid,
        progress: p.progress,
        tokensOnQuest: p.tokensEarned,
        ledgerAmount: tx ? tx.amount : null,
        ledgerDesc: tx ? tx.description : null,
        ledgerAt: tx ? tx.timestamp : null,
        match: tx ? how : latestQuestReward ? "no_title_match" : "no_quest_reward_tx",
        latestOther: !tx && latestQuestReward ? latestQuestReward.description : null,
      });
    }

    console.log(
      "Character".padEnd(22) +
        "Progress".padEnd(12) +
        "QuestTok".padEnd(10) +
        "Ledger".padEnd(8) +
        "Match".padEnd(26) +
        "Notes"
    );
    console.log("-".repeat(100));

    let gotLedger = 0;
    let missing = 0;
    for (const r of rows) {
      const notes =
        r.match === "no_title_match" && r.latestOther
          ? `latest quest_reward: ${String(r.latestOther).slice(0, 45)}…`
          : r.ledgerDesc
            ? String(r.ledgerDesc).slice(0, 50)
            : "";
      console.log(
        String(r.characterName || "?").slice(0, 21).padEnd(22) +
          String(r.progress).padEnd(12) +
          String(r.tokensOnQuest ?? "—").padEnd(10) +
          String(r.ledgerAmount ?? "—").padEnd(8) +
          String(r.match).padEnd(26) +
          notes
      );
      if (r.ledgerAmount != null) gotLedger++;
      else if (String(r.progress).toLowerCase() === "completed") missing++;
    }

    console.log("-".repeat(100));
    console.log(
      `Rows checked: ${rows.length} (${includeFailed ? "completed + failed" : "completed only"})`
    );
    console.log(`Completed participants with a matching quest_reward tx: ${gotLedger}`);
    console.log(`Completed participants with NO matching tx: ${missing}\n`);
  } finally {
    await DatabaseConnectionManager.closeAll();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
