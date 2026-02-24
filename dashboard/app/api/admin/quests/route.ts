// ============================================================================
// ------------------- Admin Quests API -------------------
// GET /api/admin/quests - List quests (admin only)
// POST /api/admin/quests - Create quest (admin only)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { logger } from "@/utils/logger";

const QUEST_TYPES = ["Art", "Writing", "Interactive", "RP", "Art / Writing"] as const;
const STATUSES = ["draft", "pending", "active", "completed"] as const;

type QuestType = (typeof QUEST_TYPES)[number];
type Status = (typeof STATUSES)[number];

// Parse "ItemName:qty" or "Item1:1; Item2:2" into itemReward/itemRewardQty or itemRewards
function parseItemRewards(
  itemReward: string | null | undefined,
  itemRewardQty: number | null | undefined,
  itemRewardsString: string | null | undefined
): {
  itemReward: string | null;
  itemRewardQty: number | null;
  itemRewards: Array<{ name: string; quantity: number }>;
} {
  const result: {
    itemReward: string | null;
    itemRewardQty: number | null;
    itemRewards: Array<{ name: string; quantity: number }>;
  } = {
    itemReward: null,
    itemRewardQty: null,
    itemRewards: [],
  };

  if (itemRewardsString && itemRewardsString.trim()) {
    const parts = itemRewardsString.split(";").map((s) => s.trim()).filter(Boolean);
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

  if (result.itemRewards.length === 0 && itemReward && itemReward.trim()) {
    result.itemReward = itemReward.trim();
    result.itemRewardQty =
      itemRewardQty != null && !Number.isNaN(Number(itemRewardQty))
        ? Math.max(0, Number(itemRewardQty))
        : 1;
  }

  return result;
}

function convertParticipantsMapToObject(quest: Record<string, unknown>): Record<string, unknown> {
  const out = { ...quest };
  if (out.participants instanceof Map) {
    out.participants = Object.fromEntries(out.participants as Map<string, unknown>);
  }
  return out;
}

// ----------------------------------------------------------------------------
// GET - List quests
// ----------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const admin = await isAdminUser(user.id);
    if (!admin) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    await connect();
    const Quest = (await import("@/models/QuestModel.js")).default;
    const status = req.nextUrl.searchParams.get("status") as Status | null;
    const query = status && STATUSES.includes(status) ? { status } : {};
    const quests = await Quest.find(query)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const converted = (quests as Record<string, unknown>[]).map(convertParticipantsMapToObject);
    return NextResponse.json({ quests: converted });
  } catch (e) {
    logger.error("api/admin/quests GET", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch quests" },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// POST - Create quest
// ----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const admin = await isAdminUser(user.id);
    if (!admin) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await req.json();

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const date = typeof body.date === "string" ? body.date.trim() : "";
    const questType = body.questType as string;
    const location = typeof body.location === "string" ? body.location.trim() : "";
    const timeLimit = typeof body.timeLimit === "string" ? body.timeLimit.trim() : "";
    let questID = typeof body.questID === "string" ? body.questID.trim() : "";

    if (!title || !description || !date || !location || !timeLimit) {
      return NextResponse.json(
        {
          error: "Validation failed",
          message: "title, description, date, location, and timeLimit are required",
        },
        { status: 400 }
      );
    }

    await connect();
    const Quest = (await import("@/models/QuestModel.js")).default;

    if (!questID) {
      const maxQuest = (await Quest.findOne()
        .sort({ questID: -1 })
        .select("questID")
        .lean()) as { questID?: string } | null;
      const match = maxQuest?.questID?.match(/^Q(\d+)$/i);
      const nextNum = match ? parseInt(match[1], 10) + 1 : 1;
      questID = `Q${nextNum}`;
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

    const existing = await Quest.findOne({ questID }).lean();
    if (existing) {
      return NextResponse.json(
        { error: "Validation failed", message: "questID already in use" },
        { status: 400 }
      );
    }

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

    const tableRollNameVal =
      typeof body.tableRollName === "string"
        ? body.tableRollName.trim() || null
        : typeof body.tableroll === "string"
          ? body.tableroll.trim() || null
          : null;
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

    const questData: Record<string, unknown> = {
      title,
      description,
      rules: typeof body.rules === "string" ? body.rules.trim() || null : null,
      date,
      questType,
      location,
      timeLimit,
      createdByUserId: user.id,
      createdByUsername: user.username ?? null,
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
      tableroll: tableRollNameVal,
      tableRollName: tableRollNameVal,
      requiredRolls: requiredRollsVal,
      tokenReward: tokenRewardVal,
      itemReward: itemRewardsFinal?.length === 1 ? itemRewardsFinal[0].name : itemParsed.itemReward,
      itemRewardQty: itemRewardsFinal?.length === 1 ? itemRewardsFinal[0].quantity : itemParsed.itemRewardQty,
      itemRewards: itemRewardsFinal,
      rpThreadParentChannel:
        typeof body.rpThreadParentChannel === "string"
          ? body.rpThreadParentChannel.trim() || null
          : null,
      collabAllowed: Boolean(body.collabAllowed),
      collabRule: typeof body.collabRule === "string" ? body.collabRule.trim() || null : null,
      artWritingMode: body.artWritingMode === "either" ? "either" : "both",
      questID,
      status,
      posted,
      postedAt,
      botNotes: typeof body.botNotes === "string" ? body.botNotes.trim() || null : null,
    };

    const QuestModel = Quest as unknown as new (data: Record<string, unknown>) => { save: () => Promise<unknown>; toObject: () => Record<string, unknown> };
    const quest = new QuestModel(questData);
    await quest.save();
    const saved = convertParticipantsMapToObject(quest.toObject() as Record<string, unknown>);

    return NextResponse.json(saved, { status: 201 });
  } catch (e) {
    logger.error("api/admin/quests POST", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to create quest" },
      { status: 500 }
    );
  }
}
