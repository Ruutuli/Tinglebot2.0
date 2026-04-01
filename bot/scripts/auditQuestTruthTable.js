// ============================================================================
// auditQuestTruthTable.js
//
// One report per quest: quest participants + ApprovedSubmission (questEvent) +
// TokenTransaction (quest_reward). Read-only.
//
// Usage:
//   node bot/scripts/auditQuestTruthTable.js Q915540
//   node bot/scripts/auditQuestTruthTable.js Q915540 Q803672
//   node bot/scripts/auditQuestTruthTable.js --search "Horse Play"
//   node bot/scripts/auditQuestTruthTable.js --search "Board the Ships" --search "Forest"
//
// Columns:
//   Character | userId | quest progress | tokensOnQuest | approved sub? | ledger? | amount | notes
// ============================================================================
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const DatabaseConnectionManager = require("../database/connectionManager");
const Quest = require("../models/QuestModel");
const TokenTransaction = require("../models/TokenTransactionModel");
const ApprovedSubmission = require("../models/ApprovedSubmissionModel");

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

/** Collab may be string (legacy), array of mentions, or "N/A". Matches mod.js approval paths. */
function normalizeCollabArray(collab) {
  if (collab == null) return [];
  const raw = collab === "N/A" ? [] : collab;
  const arr = Array.isArray(raw) ? raw : [raw];
  const ids = [];
  for (const m of arr) {
    if (m == null) continue;
    const str = String(m).trim();
    if (!str || str === "N/A") continue;
    const id = normalizeUserId(str);
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Whether this approved submission counts for this quest participant (submitter,
 * collaborator mention, or tagged character name matches participant.characterName).
 */
function submissionTouchesParticipant(sub, participant) {
  if (!sub || !participant || typeof participant !== "object") return false;
  const uid = normalizeUserId(participant.userId);
  if (!uid) return false;
  if (normalizeUserId(sub.userId) === uid) return true;
  if (normalizeCollabArray(sub.collab).includes(uid)) return true;
  const tagged = Array.isArray(sub.taggedCharacters) ? sub.taggedCharacters : [];
  const charName = (participant.characterName || "").trim().toLowerCase();
  if (
    charName &&
    tagged.some((t) => String(t).trim().toLowerCase() === charName)
  ) {
    return true;
  }
  return false;
}

function submissionMatchVia(sub, participant) {
  if (!sub || !participant || typeof participant !== "object") return null;
  const uid = normalizeUserId(participant.userId);
  if (!uid) return null;
  if (normalizeUserId(sub.userId) === uid) return "submitter";
  if (normalizeCollabArray(sub.collab).includes(uid)) return "collab";
  const tagged = Array.isArray(sub.taggedCharacters) ? sub.taggedCharacters : [];
  const charName = (participant.characterName || "").trim().toLowerCase();
  if (
    charName &&
    tagged.some((t) => String(t).trim().toLowerCase() === charName)
  ) {
    return "tagged";
  }
  return null;
}

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
  if (tx) return { tx, how: "exact" };

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
    if (tx) return { tx, how: "title_strip" };
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
  if (tx) return { tx, how: "contains" };

  const anyQ = await TokenTransaction.findOne({
    userId,
    category: "quest_reward",
    type: "earned",
  })
    .sort({ timestamp: -1 })
    .lean();
  return { tx: null, how: "none", latestQuestReward: anyQ };
}

function iterParticipants(participants) {
  if (!participants) return [];
  if (participants instanceof Map) return Array.from(participants.entries());
  if (typeof participants === "object") return Object.entries(participants);
  return [];
}

function noteForFlags(p, hasSub, ledgerTx, how) {
  const prog = String(p?.progress || "").toLowerCase();
  const te = Number(p?.tokensEarned);
  const hasTokDoc = Number.isFinite(te) && te > 0;
  const hasLedger = Boolean(ledgerTx);

  const bits = [];
  if (hasSub && !hasLedger && (prog === "completed" || prog === "rewarded"))
    bits.push("sub_yes_ledger_no");
  if (!hasSub && prog === "completed") bits.push("completed_no_sub");
  if (hasLedger && prog === "completed" && !hasTokDoc)
    bits.push("ledger_yes_quest_incomplete_display");
  if (prog === "rewarded" && !hasTokDoc && !hasLedger) bits.push("rewarded_no_tokens_on_quest");
  if (how === "none" && hasLedger === false && prog === "failed" && hasSub)
    bits.push("failed_but_has_sub");
  return bits.join("; ") || "—";
}

async function collectQuestIds(argv) {
  const questIds = new Set();
  const searches = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--search" && argv[i + 1]) {
      searches.push(String(argv[++i]).trim());
      continue;
    }
    if (/^Q\d+$/i.test(argv[i])) {
      questIds.add(argv[i].toUpperCase());
    }
  }

  for (const term of searches) {
    if (!term) continue;
    const rx = new RegExp(escapeRegex(term), "i");
    const hits = await Quest.find({ title: rx }).select("questID title").lean();
    if (hits.length === 0) {
      console.error(`[warn] --search "${term}" matched no quests`);
      continue;
    }
    for (const h of hits) {
      if (h.questID) questIds.add(String(h.questID).toUpperCase());
    }
    console.error(`[info] --search "${term}" -> ${hits.map((h) => h.questID).join(", ")}`);
  }

  for (const q of [...questIds]) {
    const exists = await Quest.findOne({ questID: q }).select("questID").lean();
    if (!exists) {
      console.error(`[warn] Quest ID not found: ${q}`);
      questIds.delete(q);
    }
  }

  return [...questIds];
}

async function printTruthForQuest(questID) {
  const quest = await Quest.findOne({ questID }).lean();
  if (!quest) {
    console.log(`\n=== ${questID} NOT FOUND ===\n`);
    return;
  }

  const title = quest.title || "";
  const questType = quest.questType || "";

  const subs = await ApprovedSubmission.find({
    questEvent: new RegExp(`^${escapeRegex(questID)}$`, "i"),
  })
    .sort({ approvedAt: -1 })
    .lean();

  console.log("\n" + "=".repeat(110));
  console.log(`QUEST ${questID} | ${title}`);
  console.log(`type: ${questType} | status: ${quest.status} | approved submissions (this questEvent): ${subs.length}`);
  console.log("=".repeat(110));

  const col = (s, w) => String(s ?? "").slice(0, w).padEnd(w);

  console.log(
    col("Character", 18) +
      col("userId", 19) +
      col("progress", 11) +
      col("qTok", 6) +
      col("sub?", 5) +
      col("ledger", 7) +
      col("amt", 5) +
      col("match", 12) +
      "notes"
  );
  console.log("-".repeat(110));

  const entries = iterParticipants(quest.participants);

  for (const [, p] of entries) {
    if (!p || typeof p !== "object") continue;
    const uid = normalizeUserId(p.userId);
    const name = p.characterName || "?";

    const sub = subs.find((s) => submissionTouchesParticipant(s, p));
    const hasSub = Boolean(sub);
    const subVia = sub ? submissionMatchVia(sub, p) : null;

    const { tx, how, latestQuestReward } = uid
      ? await findLedgerQuestReward(uid, title)
      : { tx: null, how: "none" };

    const amt = tx ? String(tx.amount) : "—";
    const led = tx ? "yes" : "no";
    const subStr = hasSub ? "yes" : "no";
    const te = Number(p.tokensEarned);
    const qTok = Number.isFinite(te) && te > 0 ? String(te) : "0";

    let notes = noteForFlags(p, hasSub, tx, how);
    if (!tx && latestQuestReward && how === "none") {
      notes =
        (notes === "—" ? "" : notes + " | ") +
        `other_q_reward: ${String(latestQuestReward.description || "").slice(0, 40)}`;
    }
    if (hasSub && sub) {
      const via = subVia ? ` via=${subVia}` : "";
      notes =
        (notes === "—" ? "" : notes + " | ") +
        `sub:${sub.category}${via} ${sub.approvedAt ? new Date(sub.approvedAt).toISOString().slice(0, 10) : ""}`;
    }

    console.log(
      col(name, 18) +
        col(uid, 19) +
        col(p.progress, 11) +
        col(qTok, 6) +
        col(subStr, 5) +
        col(led, 7) +
        col(amt, 5) +
        col(tx ? how : "—", 12) +
        notes
    );
  }

  const orphanSubs = subs.filter(
    (s) => !entries.some(([, part]) => submissionTouchesParticipant(s, part))
  );

  if (orphanSubs.length) {
    console.log("-".repeat(110));
    console.log(
      `Submissions for ${questID} with no quest participant match (submitter / collab / tagged character):`
    );
    for (const s of orphanSubs.slice(0, 20)) {
      console.log(
        `  submissionId=${s.submissionId} userId=${s.userId} title=${String(s.title).slice(0, 40)} approvedAt=${s.approvedAt}`
      );
    }
    if (orphanSubs.length > 20) console.log(`  ... +${orphanSubs.length - 20} more`);
  }

  console.log("");
}

async function main() {
  loadEnv();
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error(
      "Usage:\n" +
        "  node bot/scripts/auditQuestTruthTable.js Q915540 [Q803672 ...]\n" +
        '  node bot/scripts/auditQuestTruthTable.js --search "Horse Play"\n'
    );
    process.exit(1);
  }

  await DatabaseConnectionManager.initialize();
  try {
    const questIds = await collectQuestIds(argv);
    if (questIds.length === 0) {
      console.error("No valid quest IDs to audit.");
      process.exit(1);
    }

    for (const qid of questIds) {
      await printTruthForQuest(qid);
    }
    console.log("Legend:");
    console.log("  qTok = tokensEarned stored on quest participant (0 if missing)");
    console.log(
      "  sub? = approved submission (questEvent) where participant is submitter, collab mention, or taggedCharacters matches characterName"
    );
    console.log("  ledger = quest_reward TokenTransaction whose description matches this quest title");
    console.log("  flags in notes: sub_yes_ledger_no, ledger_yes_quest_incomplete_display, completed_no_sub, etc.\n");
  } finally {
    await DatabaseConnectionManager.closeAll();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
