// ============================================================================
// ------------------- Admin Quest by ID API -------------------
// GET /api/admin/quests/[id] - Get one quest (admin only)
// PUT /api/admin/quests/[id] - Update quest (admin only)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { discordApiRequest, removeGuildMemberRole } from "@/lib/discord";
import { buildQuestEmbed } from "@/lib/questDiscordPost";
import { isModeratorUser } from "@/lib/moderator";
import { getSession, isAdminUser } from "@/lib/session";
import { logger } from "@/utils/logger";

async function canAccessQuestAdmin(userId: string): Promise<boolean> {
  const [admin, mod] = await Promise.all([isAdminUser(userId), isModeratorUser(userId)]);
  return admin || mod;
}

const QUEST_TYPES = ["Art", "Writing", "Interactive", "Interactive / RP", "RP", "Art / Writing"] as const;
const STATUSES = ["draft", "pending", "active", "completed"] as const;

type QuestType = (typeof QUEST_TYPES)[number];
type Status = (typeof STATUSES)[number];

function parseItemRewards(
  itemReward: string | null | undefined,
  itemRewardQty: number | null | undefined,
  itemRewardsString: string | null | undefined
): {
  itemReward: string | null;
  itemRewardQty: number | null;
  itemRewards: Array<{ name: string; quantity: number }>;
} {
  const result = {
    itemReward: null as string | null,
    itemRewardQty: null as number | null,
    itemRewards: [] as Array<{ name: string; quantity: number }>,
  };

  if (itemRewardsString && String(itemRewardsString).trim()) {
    const parts = String(itemRewardsString)
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 1 && parts[0].includes(":")) {
      const [name, qtyStr] = parts[0].split(":").map((s) => s.trim());
      if (name) {
        result.itemReward = name;
        result.itemRewardQty = Math.max(0, parseInt(qtyStr || "1", 10) || 1);
      }
    } else if (parts.length > 0) {
      for (const part of parts) {
        if (part.includes(":")) {
          const [name, qtyStr] = part.split(":").map((s) => s.trim());
          if (name) {
            result.itemRewards.push({
              name,
              quantity: Math.max(0, parseInt(qtyStr || "1", 10) || 1),
            });
          }
        } else if (part) {
          result.itemRewards.push({ name: part, quantity: 1 });
        }
      }
    }
  }

  if (result.itemRewards.length === 0 && itemReward && String(itemReward).trim()) {
    result.itemReward = String(itemReward).trim();
    result.itemRewardQty =
      itemRewardQty != null && !Number.isNaN(Number(itemRewardQty))
        ? Math.max(0, Number(itemRewardQty))
        : 1;
  }

  return result;
}

const MAX_QUEST_RP_THREADS = 10;

function normalizeRpThreadCount(raw: unknown, existing: unknown): number {
  const fallback =
    typeof existing === "number" && Number.isFinite(existing)
      ? Math.floor(existing)
      : 1;
  if (raw == null || raw === "") {
    return Math.min(MAX_QUEST_RP_THREADS, Math.max(1, fallback));
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return Math.min(MAX_QUEST_RP_THREADS, Math.max(1, fallback));
  }
  return Math.min(MAX_QUEST_RP_THREADS, Math.max(1, Math.floor(n)));
}

function collectPriorRpThreadIds(ex: Record<string, unknown>): string[] {
  const arr = ex.rpThreadIds;
  if (Array.isArray(arr)) {
    const ids = arr.map((x) => String(x ?? "").trim()).filter(Boolean);
    if (ids.length) return [...new Set(ids)];
  }
  const one = ex.rpThreadId;
  if (typeof one === "string" && one.trim()) return [one.trim()];
  return [];
}

function questTypeUsesRpThreadsAdmin(questType: string): boolean {
  return questType === "RP" || questType === "Interactive / RP";
}

function buildAdminRpThreadName(
  questTitle: string,
  qid: string,
  slotIndex1Based: number,
  totalSlots: number
): string {
  const base = `📜 ${String(questTitle).trim()} (${qid})`;
  const suffix =
    totalSlots > 1
      ? ` — RP ${slotIndex1Based}/${totalSlots}`
      : " - RP Thread";
  return (base + suffix).slice(0, 100);
}

function resolveTableRollFromBody(
  body: Record<string, unknown>,
  questType: string
): {
  tableRollNames: string[];
  tableRollName: string | null;
  tableroll: string | null;
} {
  let names: string[] = [];
  if (Array.isArray(body.tableRollNames) && body.tableRollNames.length > 0) {
    names = [
      ...new Set(
        (body.tableRollNames as unknown[])
          .filter((x): x is string => typeof x === "string")
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    ];
  }
  const tn = typeof body.tableRollName === "string" ? body.tableRollName.trim() : "";
  const tb = typeof body.tableroll === "string" ? body.tableroll.trim() : "";
  const legacy = tn || tb;

  const interactiveStyle =
    questType === "Interactive" || questType === "Interactive / RP";
  const rpMultipleOptional = questType === "RP";

  const splitLegacyMulti = (): void => {
    if (names.length > 0 || !legacy) return;
    names = [...new Set(legacy.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))];
  };

  if (interactiveStyle || rpMultipleOptional) {
    splitLegacyMulti();
  } else if (names.length === 0 && legacy) {
    const firstLegacy = legacy.split(/[\n,]+/).map((s) => s.trim()).find(Boolean);
    names = firstLegacy ? [firstLegacy] : [];
  }

  const first = names[0] ?? null;
  const tablerollStr =
    interactiveStyle || rpMultipleOptional
      ? names.length === 0
        ? null
        : names.join(", ")
      : first;
  return {
    tableRollNames: names,
    tableRollName: first,
    tableroll: tablerollStr,
  };
}

function convertParticipantsMapToObject(quest: Record<string, unknown>): Record<string, unknown> {
  const out = { ...quest };
  if (out.participants instanceof Map) {
    out.participants = Object.fromEntries(out.participants as Map<string, unknown>);
  }
  return out;
}

function getParticipantUserIds(quest: Record<string, unknown>): string[] {
  const participants = quest.participants;
  if (!participants) return [];
  if (participants instanceof Map) {
    return Array.from((participants as Map<string, { userId?: string }>).keys());
  }
  if (typeof participants === "object" && participants !== null) {
    return Object.keys(participants);
  }
  return [];
}

function normalizeDiscordId(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const unwrapped = s.replace(/[<@!>]/g, "").trim();
  const digitsOnly = unwrapped.replace(/\D/g, "");
  return digitsOnly.length >= 16 ? digitsOnly : unwrapped;
}

/** Attach Discord username from User collection for admin participant management UI. */
async function enrichParticipantsWithUsernames(quest: Record<string, unknown>): Promise<void> {
  const participants = quest.participants;
  if (!participants || typeof participants !== "object" || participants === null) return;
  const map = participants as Record<string, Record<string, unknown>>;
  const ids = new Set<string>();
  for (const [key, p] of Object.entries(map)) {
    if (!p || typeof p !== "object") continue;
    const id = normalizeDiscordId(p.userId ?? key);
    if (id) ids.add(id);
  }
  if (ids.size === 0) return;

  const User = (await import("@/models/UserModel.js")).default;
  const users = await User.find({ discordId: { $in: Array.from(ids) } })
    .select({ discordId: 1, username: 1 })
    .lean()
    .exec();

  const byId = new Map<string, string>();
  for (const u of users) {
    const rec = u as { discordId?: string; username?: string };
    if (rec.discordId) {
      const un = String(rec.username ?? "").trim();
      byId.set(String(rec.discordId), un);
    }
  }

  for (const [key, p] of Object.entries(map)) {
    if (!p || typeof p !== "object") continue;
    const id = normalizeDiscordId(p.userId ?? key);
    const un = id ? byId.get(id) : undefined;
    p.username = un && un.length > 0 ? un : null;
  }
}

// ----------------------------------------------------------------------------
// GET - Get one quest by _id
// ----------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const allowed = await canAccessQuestAdmin(user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin or moderator access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid quest id" }, { status: 400 });
    }

    await connect();
    const Quest = (await import("@/models/QuestModel.js")).default;
    const quest = await Quest.findById(id).lean();
    if (!quest) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }

    const converted = convertParticipantsMapToObject(quest as Record<string, unknown>);
    await enrichParticipantsWithUsernames(converted);
    return NextResponse.json(converted);
  } catch (e) {
    logger.error("api/admin/quests/[id] GET", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch quest" },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// PUT - Update quest
// ----------------------------------------------------------------------------
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const allowed = await canAccessQuestAdmin(user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin or moderator access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid quest id" }, { status: 400 });
    }

    const body = await req.json();

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const date = typeof body.date === "string" ? body.date.trim() : "";
    const questType = body.questType as string;
    const location = typeof body.location === "string" ? body.location.trim() : "";
    const timeLimit = typeof body.timeLimit === "string" ? body.timeLimit.trim() : "";
    const questID = typeof body.questID === "string" ? body.questID.trim() : "";

    if (!title || !description || !date || !location || !timeLimit || !questID) {
      return NextResponse.json(
        {
          error: "Validation failed",
          message: "title, description, date, location, timeLimit, and questID are required",
        },
        { status: 400 }
      );
    }

    if (!QUEST_TYPES.includes(questType as QuestType)) {
      return NextResponse.json(
        {
          error: "Validation failed",
          message: `questType must be one of: ${QUEST_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const statusRaw = (body.status as string) || "active";
    const status = statusRaw === "complete" ? "completed" : statusRaw;
    if (!STATUSES.includes(status as Status)) {
      return NextResponse.json(
        { error: "Validation failed", message: "status must be draft, pending, active, or completed" },
        { status: 400 }
      );
    }

    let tokenRewardVal: string | number;
    const tokenBase = body.tokenBase != null && body.tokenBase !== "" ? Number(body.tokenBase) : NaN;
    const collabBonus = body.collabBonus != null && body.collabBonus !== "" ? Number(body.collabBonus) : 0;
    if (!Number.isNaN(tokenBase) && typeof body.tokenBase !== "undefined") {
      tokenRewardVal = collabBonus > 0 ? `flat:${tokenBase} collab_bonus:${collabBonus}` : `flat:${tokenBase}`;
    } else if (body.tokenReward !== undefined && body.tokenReward !== null) {
      const tokenReward = body.tokenReward;
      tokenRewardVal =
        typeof tokenReward === "number"
          ? tokenReward
          : typeof tokenReward === "string"
            ? tokenReward.trim()
            : String(tokenReward);
    } else {
      tokenRewardVal = "N/A";
    }

    await connect();
    const Quest = (await import("@/models/QuestModel.js")).default;

    const existing = await Quest.findById(id).lean();
    if (!existing) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }

    const otherWithSameQuestId = await Quest.findOne({
      questID,
      _id: { $ne: new mongoose.Types.ObjectId(id) },
    }).lean();
    if (otherWithSameQuestId) {
      return NextResponse.json(
        { error: "Validation failed", message: "questID already in use by another quest" },
        { status: 400 }
      );
    }

    const previousStatus = String((existing as Record<string, unknown>).status ?? "");

    const itemParsed = parseItemRewards(
      body.itemReward,
      body.itemRewardQty,
      body.itemRewardsString
    );
    const itemRewardsFinal =
      Array.isArray(body.itemRewards) && body.itemRewards.length > 0
        ? (body.itemRewards as Array<{ name: string; quantity: number }>).map((r) => ({
            name: String(r.name ?? "").trim(),
            quantity: Math.max(0, Number(r.quantity) || 1),
          })).filter((r) => r.name)
        : itemParsed.itemRewards.length > 0
          ? itemParsed.itemRewards
          : undefined;

    const tr = resolveTableRollFromBody(body as Record<string, unknown>, questType);
    const requiredRollsVal =
      body.requiredRolls != null && !Number.isNaN(Number(body.requiredRolls))
        ? Math.max(1, Number(body.requiredRolls))
        : 1;

    const posted = Boolean(body.posted);
    const postedAt =
      posted && body.postedAt
        ? new Date(body.postedAt as string)
        : posted
          ? new Date()
          : null;

    const rpThreadParentChannelVal =
      typeof body.rpThreadParentChannel === "string"
        ? body.rpThreadParentChannel.trim() || null
        : null;

    const rpThreadCountVal = normalizeRpThreadCount(
      body.rpThreadCount,
      (existing as Record<string, unknown>).rpThreadCount
    );

    let nextRpThreadIds = collectPriorRpThreadIds(existing as Record<string, unknown>);

    if (Array.isArray(body.rpThreadIds)) {
      const parsed = [
        ...new Set(
          body.rpThreadIds.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
        ),
      ];
      if (parsed.length) nextRpThreadIds = parsed;
    } else if (typeof body.rpThreadId === "string" && body.rpThreadId.trim()) {
      nextRpThreadIds = [body.rpThreadId.trim()];
    }

    if (
      posted &&
      status === "active" &&
      questTypeUsesRpThreadsAdmin(questType) &&
      rpThreadParentChannelVal &&
      nextRpThreadIds.length < rpThreadCountVal
    ) {
      const questTitle = title ?? (existing as Record<string, unknown>).title ?? "Quest";
      const questEmbed = buildQuestEmbed(existing as Parameters<typeof buildQuestEmbed>[0]);
      const rpFooter = "Use this thread for quest roleplay.";
      const existingFooter = questEmbed.footer as { text?: string } | undefined;
      const embedWithRpNote = {
        ...questEmbed,
        footer: existingFooter?.text
          ? { text: `${existingFooter.text} • ${rpFooter}` }
          : { text: rpFooter },
      };

      const channelData = await discordApiRequest<{ type: number; name?: string }>(
        `channels/${rpThreadParentChannelVal}`,
        "GET"
      );
      if (!channelData || channelData.type === undefined) {
        logger.warn("api/admin/quests/[id]", `Could not fetch channel ${rpThreadParentChannelVal}; skipping RP thread creation for quest ${questID}. GET channel returned null or missing type.`);
      } else {
        const channelType = channelData.type;
        const isForum = channelType === 15;
        const isTextOrAnnouncement = channelType === 0 || channelType === 5;
        const typeLabel =
          channelType === 15
            ? "forum"
            : channelType === 0
              ? "text"
              : channelType === 5
                ? "announcement"
                : `other(${channelType})`;
        logger.info("api/admin/quests/[id]", `RP thread creation: channel ${rpThreadParentChannelVal} type=${channelType} (${typeLabel})${channelData.name ? ` name="${channelData.name}"` : ""} for quest ${questID}`);

        const nToCreate = rpThreadCountVal - nextRpThreadIds.length;

        for (let i = 0; i < nToCreate; i++) {
          const slot = nextRpThreadIds.length + 1;
          const threadName = buildAdminRpThreadName(String(questTitle), questID, slot, rpThreadCountVal);

          if (isForum) {
            const threadResult = await discordApiRequest<{ id: string }>(
              `channels/${rpThreadParentChannelVal}/threads`,
              "POST",
              {
                name: threadName,
                message: { embeds: [embedWithRpNote] },
                auto_archive_duration: 10080,
              }
            );
            if (threadResult?.id) {
              nextRpThreadIds.push(threadResult.id);
              logger.info(
                "api/admin/quests/[id]",
                `Created RP thread ${threadResult.id} for quest ${questID} (forum, slot ${slot}/${rpThreadCountVal})`
              );
            } else {
              logger.warn(
                "api/admin/quests/[id]",
                `Failed forum RP thread slot ${slot}/${rpThreadCountVal} for quest ${questID}`
              );
            }
          } else if (isTextOrAnnouncement) {
            logger.info(
              "api/admin/quests/[id]",
              `Creating public RP thread via Start Thread from Message (slot ${slot}/${rpThreadCountVal}) for quest ${questID}`
            );
            const messageResult = await discordApiRequest<{ id: string }>(
              `channels/${rpThreadParentChannelVal}/messages`,
              "POST",
              { embeds: [embedWithRpNote] }
            );
            if (messageResult?.id) {
              const threadResult = await discordApiRequest<{ id: string }>(
                `channels/${rpThreadParentChannelVal}/messages/${messageResult.id}/threads`,
                "POST",
                { name: threadName, auto_archive_duration: 10080 }
              );
              if (threadResult?.id) {
                nextRpThreadIds.push(threadResult.id);
                logger.info(
                  "api/admin/quests/[id]",
                  `Created public RP thread ${threadResult.id} for quest ${questID} (slot ${slot}/${rpThreadCountVal})`
                );
              } else {
                logger.warn(
                  "api/admin/quests/[id]",
                  `Message posted but thread create failed for channel ${rpThreadParentChannelVal} quest ${questID} slot ${slot}/${rpThreadCountVal}.`
                );
                nextRpThreadIds.push(messageResult.id);
              }
            } else {
              logger.warn(
                "api/admin/quests/[id]",
                `Could not post message to channel ${rpThreadParentChannelVal} for quest ${questID} (RP thread slot ${slot}/${rpThreadCountVal}).`
              );
              break;
            }
          } else {
            logger.warn(
              "api/admin/quests/[id]",
              `Channel ${rpThreadParentChannelVal} type ${channelType} is not threadable (expected 0=text, 5=announcement, 15=forum); skipping RP thread for quest ${questID}`
            );
            break;
          }
        }
      }
    }

    const finalRpThreadIds = [...new Set(nextRpThreadIds)];
    const primaryRpThreadId = finalRpThreadIds[0] ?? null;

    const update: Record<string, unknown> = {
      title,
      description,
      rules: typeof body.rules === "string" ? body.rules.trim() || null : null,
      date,
      questType,
      location,
      timeLimit,
      signupDeadline:
        typeof body.signupDeadline === "string" ? body.signupDeadline.trim() || null : null,
      participantCap:
        body.participantCap != null && !Number.isNaN(Number(body.participantCap))
          ? Number(body.participantCap)
          : null,
      postRequirement:
        body.postRequirement != null && !Number.isNaN(Number(body.postRequirement))
          ? Number(body.postRequirement)
          : null,
      minRequirements: body.minRequirements ?? 0,
      tableroll: tr.tableroll,
      tableRollName: tr.tableRollName,
      tableRollNames: tr.tableRollNames,
      requiredRolls: requiredRollsVal,
      tokenReward: tokenRewardVal,
      itemReward: itemRewardsFinal?.length === 1 ? itemRewardsFinal[0].name : itemParsed.itemReward,
      itemRewardQty: itemRewardsFinal?.length === 1 ? itemRewardsFinal[0].quantity : itemParsed.itemRewardQty,
      itemRewards: itemRewardsFinal,
      rpThreadParentChannel: rpThreadParentChannelVal,
      rpThreadCount: rpThreadCountVal,
      rpThreadIds: finalRpThreadIds,
      rpThreadId: primaryRpThreadId,
      collabAllowed: Boolean(body.collabAllowed),
      collabRule: typeof body.collabRule === "string" ? body.collabRule.trim() || null : null,
      artWritingMode: body.artWritingMode === "either" ? "either" : "both",
      questID,
      status,
      posted,
      postedAt,
      botNotes: typeof body.botNotes === "string" ? body.botNotes.trim() || null : null,
    };

    if (body.timeLimitEndDate !== undefined) {
      (update as Record<string, unknown>).timeLimitEndDate =
        typeof body.timeLimitEndDate === "string" && body.timeLimitEndDate.trim()
          ? /^\d{4}-\d{2}-\d{2}$/.test(body.timeLimitEndDate.trim())
            ? body.timeLimitEndDate.trim()
            : null
          : null;
    }

    const updated = await Quest.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    )
      .lean()
      .exec();

    if (!updated) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }

    const updatedRecord = updated as Record<string, unknown>;

    if (status === "completed" && previousStatus !== "completed") {
      const questRoleId = updatedRecord.roleID
        ? String(updatedRecord.roleID).trim()
        : "";
      const docGuildId =
        updatedRecord.guildId == null
          ? ""
          : String(updatedRecord.guildId).trim();
      const roleGuildId = String(
        docGuildId || (process.env.GUILD_ID?.trim() ?? "")
      );
      if (questRoleId && roleGuildId) {
        const rawP = updatedRecord.participants;
        const pairs: Array<[string, unknown]> =
          rawP instanceof Map
            ? Array.from((rawP as Map<string, unknown>).entries())
            : rawP && typeof rawP === "object" && rawP !== null
              ? Object.entries(rawP as Record<string, unknown>)
              : [];
        for (const [uid, p] of pairs) {
          if (!p || typeof p !== "object") continue;
          const userId = normalizeDiscordId(
            (p as { userId?: string }).userId ?? uid
          );
          if (!userId) continue;
          const rm = await removeGuildMemberRole(
            roleGuildId,
            userId,
            questRoleId
          );
          if (!rm.ok) {
            logger.warn(
              "api/admin/quests/[id] PUT",
              `Could not remove quest role for ${userId}: ${rm.error}`
            );
          }
        }
        await Quest.findByIdAndUpdate(id, {
          $set: { participantQuestRolesStrippedAt: new Date() },
        }).exec();
      }
    }

    const rawThreadIds = updatedRecord.rpThreadIds;
    const threadIdsForMembers: string[] =
      Array.isArray(rawThreadIds) && rawThreadIds.length > 0
        ? [
            ...new Set(
              rawThreadIds
                .map((x) => String(x ?? "").trim())
                .filter(Boolean)
            ),
          ]
        : updatedRecord.rpThreadId &&
            typeof updatedRecord.rpThreadId === "string" &&
            updatedRecord.rpThreadId.trim()
          ? [updatedRecord.rpThreadId.trim()]
          : [];

    if (questTypeUsesRpThreadsAdmin(questType) && threadIdsForMembers.length > 0) {
      const userIds = getParticipantUserIds(updatedRecord);
      for (const threadChannelId of threadIdsForMembers) {
        for (const userId of userIds) {
          if (!userId || typeof userId !== "string") continue;
          try {
            await discordApiRequest(
              `channels/${threadChannelId.trim()}/thread-members/${userId.trim()}`,
              "PUT"
            );
          } catch (e) {
            logger.warn(
              "api/admin/quests/[id]",
              `Error adding participant ${userId} to RP thread ${threadChannelId}: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }
      }
    }

    const converted = convertParticipantsMapToObject(updatedRecord);
    return NextResponse.json(converted);
  } catch (e) {
    logger.error("api/admin/quests/[id] PUT", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to update quest" },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// DELETE - Delete quest (mod or admin)
// ----------------------------------------------------------------------------
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const allowed = await canAccessQuestAdmin(user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin or moderator access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid quest id" }, { status: 400 });
    }

    await connect();
    const Quest = (await import("@/models/QuestModel.js")).default;
    const deleted = await Quest.findByIdAndDelete(id).exec();
    if (!deleted) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, deleted: deleted.questID ?? id });
  } catch (e) {
    logger.error("api/admin/quests/[id] DELETE", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to delete quest" },
      { status: 500 }
    );
  }
}
