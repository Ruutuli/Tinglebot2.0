// ============================================================================
// auditFixQuestTracking.js
// Purpose:
//   Audit (and optionally fix) User quest tracking fields so they remain
//   consistent with current quest semantics (see bot/models/UserModel.js).
//
// Stored shape in DB (after audit) — example for one user:
//
//   quests: {
//     bot: { completed: 7, pending: 7 },   // bot: completed since bot introduced; pending = not yet turned in
//     legacy: {
//       completed: 33,                     // legacy: pre-bot quests imported
//       pending: 3,                       // legacy: not yet turned in
//       transferredAt: Date,
//       transferUsed: true
//     },
//     lastCompletionAt: Date,
//     typeTotals: { art, writing, interactive, rp, artWriting, other },
//     completions: [ { questId, questType, questTitle, completedAt, rewardedAt, ... } ],
//     turnIns: { totalSetsTurnedIn, lastTurnedInAt, history: [{ turnedInAt, amount, fromBot, fromLegacy }] }
//   }
//
//   Derived: allTimeTotal = bot.completed + legacy.completed; totalPendingTurnIns = bot.pending + legacy.pending
//
// Default mode is DRY RUN (no writes).
//
// Usage:
//   node bot/scripts/auditFixQuestTracking.js
//   node bot/scripts/auditFixQuestTracking.js --apply
//
// Optional flags:
//   --discordId <id>   Only audit one user
//   --skip <n>         Skip N users
//   --limit <n>        Limit to N users
//   --json             Output JSON lines (one per changed user + final summary)
// ============================================================================
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

const DatabaseConnectionManager = require("../database/connectionManager");
const User = require("../models/UserModel");
const { countUniqueQuestCompletions } = require("../utils/questTrackingUtils");
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

function parseNumberFlag(name, defaultValue = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return defaultValue;
  const raw = process.argv[idx + 1];
  if (raw == null) return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.max(0, Math.floor(n));
}

function parseStringFlag(name, defaultValue = "") {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return defaultValue;
  const raw = process.argv[idx + 1];
  if (raw == null) return defaultValue;
  return String(raw).trim();
}

function toNonNegInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function defaultQuestTracking() {
  return {
    bot: { completed: 0, pending: 0, pendingSlotOnly: 0 },
    legacy: {
      completed: 0,
      pending: 0,
      transferredAt: null,
      transferUsed: false,
    },
    lastCompletionAt: null,
    typeTotals: {
      art: 0,
      writing: 0,
      interactive: 0,
      rp: 0,
      artWriting: 0,
      other: 0,
    },
    completions: [],
    turnIns: {
      totalSetsTurnedIn: 0,
      lastTurnedInAt: null,
      history: [],
    },
  };
}

/** Read current or legacy field names for snapshot/derived. */
function getQuestSnapshot(userDoc) {
  const q = (userDoc && userDoc.quests) || {};
  const legacy = (q && q.legacy) || {};
  const botCompleted = q.bot?.completed ?? q.totalCompleted;
  const botPending = q.bot?.pending ?? q.pendingTurnIns;
  const botPendingSlotOnly = toNonNegInt(q.bot?.pendingSlotOnly);
  // Prefer old keys when present so we don't hide legacy data (Mongoose may add legacy.completed/pending = 0 from schema)
  const legacyCompleted =
    legacy.totalTransferred !== undefined && legacy.totalTransferred !== null
      ? toNonNegInt(legacy.totalTransferred)
      : toNonNegInt(legacy.completed);
  const legacyPending =
    legacy.pendingTurnIns !== undefined && legacy.pendingTurnIns !== null
      ? toNonNegInt(legacy.pendingTurnIns)
      : toNonNegInt(legacy.pending);
  return {
    botCompleted,
    botPending,
    botPendingSlotOnly,
    legacyCompleted,
    legacyPending,
    legacyTransferUsed: legacy.transferUsed,
    legacyTransferredAt: legacy.transferredAt,
    typeTotals: q.typeTotals,
    completionsCount: Array.isArray(q.completions) ? q.completions.length : null,
  };
}

function computeDerived(snapshot) {
  const botCompleted = toNonNegInt(snapshot.botCompleted);
  const legacyCompleted = toNonNegInt(snapshot.legacyCompleted);
  const botPending = toNonNegInt(snapshot.botPending);
  const legacyPending = toNonNegInt(snapshot.legacyPending);
  const totalCompletedAllTime = botCompleted + legacyCompleted;
  const botPendingSlotOnly = toNonNegInt(snapshot.botPendingSlotOnly);
  const totalPendingTurnIns = botPending + legacyPending + botPendingSlotOnly;
  const redeemableSets = Math.floor(totalPendingTurnIns / 10);
  const remainder = totalPendingTurnIns % 10;
  return {
    botCompleted,
    legacyCompleted,
    totalCompletedAllTime,
    botPending,
    legacyPending,
    totalPendingTurnIns,
    redeemableSets,
    remainder,
  };
}

/** Migrate old shape (totalCompleted, pendingTurnIns, legacy.totalTransferred, legacy.pendingTurnIns) to bot/legacy.completed and .pending. */
function migrateQuestShape(q) {
  if (!q || typeof q !== "object") return false;
  let changed = false;
  if (q.totalCompleted !== undefined || q.pendingTurnIns !== undefined) {
    if (!q.bot || typeof q.bot !== "object") q.bot = { completed: 0, pending: 0, pendingSlotOnly: 0 };
    if (typeof q.bot.completed !== "number") q.bot.completed = toNonNegInt(q.totalCompleted);
    if (typeof q.bot.pending !== "number") q.bot.pending = toNonNegInt(q.pendingTurnIns);
    if (typeof q.bot.pendingSlotOnly !== "number") q.bot.pendingSlotOnly = 0;
    changed = true;
  }
  const legacy = q.legacy || {};
  if (legacy.totalTransferred !== undefined || legacy.pendingTurnIns !== undefined) {
    if (!q.legacy || typeof q.legacy !== "object") q.legacy = { ...defaultQuestTracking().legacy };
    if (typeof q.legacy.completed !== "number") q.legacy.completed = toNonNegInt(legacy.totalTransferred);
    if (typeof q.legacy.pending !== "number") q.legacy.pending = toNonNegInt(legacy.pendingTurnIns);
    changed = true;
  }
  return changed;
}

function applyFixesToUser(userDoc) {
  const changes = [];
  let changed = false;

  // Ensure quests object exists (but do NOT call ensureQuestTracking to avoid recomputePendingTurnInsIfNeeded).
  if (!userDoc.quests || typeof userDoc.quests !== "object") {
    userDoc.quests = defaultQuestTracking();
    changes.push("init: quests");
    changed = true;
  }

  const q = userDoc.quests;

  // Ensure core containers exist
  if (!q.typeTotals || typeof q.typeTotals !== "object") {
    q.typeTotals = { ...defaultQuestTracking().typeTotals };
    changes.push("init: quests.typeTotals");
    changed = true;
  } else {
    const defaults = defaultQuestTracking().typeTotals;
    for (const k of Object.keys(defaults)) {
      if (typeof q.typeTotals[k] !== "number") {
        q.typeTotals[k] = defaults[k];
        if (!changes.includes("fix: quests.typeTotals")) changes.push("fix: quests.typeTotals");
        changed = true;
      }
    }
  }

  if (!Array.isArray(q.completions)) {
    q.completions = [];
    changes.push("init: quests.completions");
    changed = true;
  }

  // Migrate old shape to bot/legacy.completed and .pending first
  if (migrateQuestShape(q)) {
    changes.push("migrate: old shape → bot/legacy");
    changed = true;
  }

  if (!q.bot || typeof q.bot !== "object") {
    q.bot = { ...defaultQuestTracking().bot };
    changes.push("init: quests.bot");
    changed = true;
  }
  if (typeof q.bot.completed !== "number") q.bot.completed = defaultQuestTracking().bot.completed;
  if (typeof q.bot.pending !== "number") q.bot.pending = defaultQuestTracking().bot.pending;
  if (typeof q.bot.pendingSlotOnly !== "number") q.bot.pendingSlotOnly = defaultQuestTracking().bot.pendingSlotOnly;

  if (!q.legacy || typeof q.legacy !== "object") {
    q.legacy = { ...defaultQuestTracking().legacy };
    changes.push("init: quests.legacy");
    changed = true;
  } else {
    const legacyDefaults = defaultQuestTracking().legacy;
    for (const k of Object.keys(legacyDefaults)) {
      if (typeof q.legacy[k] === "undefined" || q.legacy[k] === null) {
        q.legacy[k] = legacyDefaults[k];
        if (!changes.includes("fix: quests.legacy defaults")) changes.push("fix: quests.legacy defaults");
        changed = true;
      }
    }
  }

  if (!q.turnIns || typeof q.turnIns !== "object") {
    q.turnIns = { ...defaultQuestTracking().turnIns };
    changes.push("init: quests.turnIns");
    changed = true;
  } else {
    const tiDefaults = defaultQuestTracking().turnIns;
    if (typeof q.turnIns.totalSetsTurnedIn !== "number") {
      q.turnIns.totalSetsTurnedIn = tiDefaults.totalSetsTurnedIn;
      changed = true;
      if (!changes.includes("fix: quests.turnIns defaults")) changes.push("fix: quests.turnIns defaults");
    }
    if (q.turnIns.lastTurnedInAt === undefined || q.turnIns.lastTurnedInAt === null) {
      q.turnIns.lastTurnedInAt = tiDefaults.lastTurnedInAt;
      changed = true;
      if (!changes.includes("fix: quests.turnIns defaults")) changes.push("fix: quests.turnIns defaults");
    }
    if (!Array.isArray(q.turnIns.history)) {
      q.turnIns.history = [];
      changed = true;
      if (!changes.includes("fix: quests.turnIns defaults")) changes.push("fix: quests.turnIns defaults");
    }
  }

  // Sanitize numbers (new shape)
  const beforeBotCompleted = q.bot.completed;
  const beforeBotPending = q.bot.pending;
  const beforeLegacyCompleted = q.legacy.completed;
  const beforeLegacyPending = q.legacy.pending;

  q.bot.completed = toNonNegInt(q.bot.completed);
  q.bot.pending = toNonNegInt(q.bot.pending);
  q.legacy.completed = toNonNegInt(q.legacy.completed);
  q.legacy.pending = toNonNegInt(q.legacy.pending);

  if (
    q.bot.completed !== beforeBotCompleted ||
    q.bot.pending !== beforeBotPending ||
    q.legacy.completed !== beforeLegacyCompleted ||
    q.legacy.pending !== beforeLegacyPending
  ) {
    changes.push("fix: sanitize counts");
    changed = true;
  }

  // Legacy invariant: pending cannot exceed completed.
  if (q.legacy.pending > q.legacy.completed) {
    q.legacy.pending = q.legacy.completed;
    changes.push("fix: clamp legacy.pending");
    changed = true;
  }

  const actualUnique = countUniqueQuestCompletions(q.completions);
  const hasSlotOnlyTracking =
    toNonNegInt(q.bot.pendingSlotOnly) > 0 ||
    (Array.isArray(q.completions) && q.completions.some((c) => c && c.slotOnlyTurnIn === true));

  if (!hasSlotOnlyTracking && q.bot.completed < actualUnique) {
    const diff = actualUnique - q.bot.completed;
    q.bot.completed = actualUnique;
    q.bot.pending = toNonNegInt(q.bot.pending) + diff;
    changes.push(`fix: undercount bot.completed (+${diff})`);
    changed = true;
  }

  if (!hasSlotOnlyTracking && q.bot.pending === 0 && q.bot.completed > 0 && q.bot.completed === actualUnique) {
    q.bot.pending = q.bot.completed;
    changes.push(`fix: bot pending 0 → ${q.bot.completed} (= bot.completed)`);
    changed = true;
  }

  const warnings = [];
  if (q.bot.completed > actualUnique && actualUnique > 0) {
    // Common/expected: completions array is capped to recent entries (e.g., 25),
    // so we only warn when debugging is needed.
    warnings.push("note: bot.completed exceeds unique completions (likely due to capped history)");
  }

  return { changed, changes, warnings, actualUnique };
}

function formatOut({ json, payload }) {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }
  if (payload?.kind === "user_change") {
    const c = payload.quests || {};
    const b = payload.before || {};
    const changes = Array.isArray(payload.changes) ? payload.changes.join(", ") : "";
    const warn = Array.isArray(payload.warnings) && payload.warnings.length ? `\n  warnings: ${payload.warnings.join("; ")}` : "";
    process.stdout.write(
      `--- discordId=${payload.discordId} ---\n` +
        `  changes:   ${changes}\n` +
        `  completed: bot ${b.botCompleted}→${c.botCompleted}, legacy ${b.legacyCompleted}→${c.legacyCompleted}, total=${c.totalCompletedAllTime}\n` +
        `  pending:   bot ${b.botPending}→${c.botPending}, legacy ${b.legacyPending}→${c.legacyPending}, total=${c.totalPendingTurnIns}\n` +
        `  sets=${c.redeemableSets} rem=${c.remainder}${warn}\n\n`
    );
    return;
  }

  if (payload?.kind === "user_saved") {
    const changes = Array.isArray(payload.changes) ? payload.changes.join(", ") : "";
    const warn = Array.isArray(payload.warnings) && payload.warnings.length ? ` warnings=${payload.warnings.join("; ")}` : "";
    process.stdout.write(`✅ saved discordId=${payload.discordId} changes=[${changes}]${warn}\n`);
    return;
  }

  if (payload?.kind === "summary" && payload?.stats) {
    const s = payload.stats;
    const f = s.fixes || {};
    process.stdout.write(`${payload.message}\n`);
    process.stdout.write(
      `Fix breakdown: initQuests=${f.initQuests || 0} initLegacy=${f.initLegacy || 0} sanitizeCounts=${f.sanitizeCounts || 0} clampLegacyPending=${f.clampLegacyPending || 0} undercountRepair=${f.undercountRepair || 0} fixZeroBotPending=${f.fixZeroBotPending || 0}\n`
    );
    return;
  }

  const line = payload?.message || JSON.stringify(payload);
  process.stdout.write(`${line}\n`);
}

async function main() {
  loadEnv();

  const apply = process.argv.includes("--apply");
  const dryRun = !apply;
  const json = process.argv.includes("--json");

  const discordId = parseStringFlag("discordId", "");
  const skip = parseNumberFlag("skip", 0) || 0;
  const limit = parseNumberFlag("limit", null);

  const filter = {};
  if (discordId) filter.discordId = discordId;

  const stats = {
    mode: dryRun ? "DRY_RUN" : "APPLY",
    scanned: 0,
    changed: 0,
    saved: 0,
    errors: 0,
    fixes: {
      initQuests: 0,
      initLegacy: 0,
      sanitizeCounts: 0,
      clampLegacyPending: 0,
      undercountRepair: 0,
      fixZeroBotPending: 0,
    },
  };

  logger.info(
    "QUEST_AUDIT",
    `Starting quest audit/fix mode=${stats.mode} filter=${discordId ? `discordId=${discordId}` : "ALL"} skip=${skip} limit=${limit ?? "none"}`
  );

  await DatabaseConnectionManager.initialize();

  const query = User.find(filter).lean();
  if (skip) query.skip(skip);
  if (typeof limit === "number") query.limit(limit);

  // Use lean() so we get raw docs with legacy.totalTransferred/pendingTurnIns (not in current schema).
  const cursor = query.cursor();

  for await (const userDoc of cursor) {
    stats.scanned++;
    const id = String(userDoc.discordId || "");

    try {
      const before = getQuestSnapshot(userDoc);
      const derivedBefore = computeDerived(before);

      const result = applyFixesToUser(userDoc);
      if (!result.changed) continue;

      // Categorize fix types (best-effort based on change strings)
      for (const c of result.changes) {
        if (c === "init: quests") stats.fixes.initQuests++;
        if (c === "init: quests.legacy") stats.fixes.initLegacy++;
        if (c === "fix: sanitize counts") stats.fixes.sanitizeCounts++;
        if (c === "fix: clamp legacy.pending") stats.fixes.clampLegacyPending++;
        if (c.startsWith("fix: undercount bot.completed")) stats.fixes.undercountRepair++;
        if (c.startsWith("fix: bot pending 0 →")) stats.fixes.fixZeroBotPending++;
      }

      const after = getQuestSnapshot(userDoc);
      const derivedAfter = computeDerived(after);

      stats.changed++;

      if (dryRun) {
        formatOut({
          json,
          payload: {
            kind: "user_change",
            discordId: id,
            changes: result.changes,
            warnings: result.warnings,
            quests: {
              botCompleted: derivedAfter.botCompleted,
              legacyCompleted: derivedAfter.legacyCompleted,
              totalCompletedAllTime: derivedAfter.totalCompletedAllTime,
              botPending: derivedAfter.botPending,
              legacyPending: derivedAfter.legacyPending,
              totalPendingTurnIns: derivedAfter.totalPendingTurnIns,
              redeemableSets: derivedAfter.redeemableSets,
              remainder: derivedAfter.remainder,
            },
            before: {
              botCompleted: derivedBefore.botCompleted,
              legacyCompleted: derivedBefore.legacyCompleted,
              botPending: derivedBefore.botPending,
              legacyPending: derivedBefore.legacyPending,
            },
            completionUniqueCountObserved: result.actualUnique,
          },
        });
        continue;
      }

      await User.updateOne({ discordId: id }, { $set: { quests: userDoc.quests } });
      stats.saved++;
      formatOut({
        json,
        payload: {
          kind: "user_saved",
          discordId: id,
          changes: result.changes,
          warnings: result.warnings,
        },
      });
    } catch (err) {
      stats.errors++;
      logger.error(
        "QUEST_AUDIT",
        `Error processing discordId=${id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  formatOut({
    json,
    payload: {
      kind: "summary",
      message: `Summary mode=${stats.mode} scanned=${stats.scanned} changed=${stats.changed} ${dryRun ? "wouldSave" : "saved"}=${dryRun ? stats.changed : stats.saved} errors=${stats.errors}`,
      stats,
    },
  });

  await DatabaseConnectionManager.closeAll();
  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch(async (err) => {
  logger.error(
    "QUEST_AUDIT",
    `Fatal: ${err instanceof Error ? err.message : String(err)}`
  );
  try {
    await DatabaseConnectionManager.closeAll();
  } catch {
    // ignore
  }
  process.exit(1);
});

