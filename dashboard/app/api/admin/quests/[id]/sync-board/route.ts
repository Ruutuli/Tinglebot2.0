// POST /api/admin/quests/[id]/sync-board — PATCH linked Discord board message to match DB (no quest field changes).

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { updateQuestBoardMessage } from "@/lib/questDiscordPost";
import { isModeratorUser } from "@/lib/moderator";
import { getSession, isAdminUser } from "@/lib/session";
import { logger } from "@/utils/logger";

async function canAccessQuestAdmin(userId: string): Promise<boolean> {
  const [admin, mod] = await Promise.all([isAdminUser(userId), isModeratorUser(userId)]);
  return admin || mod;
}

function convertParticipantsMapToObject(quest: Record<string, unknown>): Record<string, unknown> {
  const out = { ...quest };
  if (out.participants instanceof Map) {
    out.participants = Object.fromEntries(out.participants as Map<string, unknown>);
  }
  return out;
}

function normalizeDiscordId(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const unwrapped = s.replace(/[<@!>]/g, "").trim();
  const digitsOnly = unwrapped.replace(/\D/g, "");
  return digitsOnly.length >= 16 ? digitsOnly : unwrapped;
}

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

export async function POST(
  _req: NextRequest,
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
    const quest = await Quest.findById(id).lean().exec();
    if (!quest) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }

    const rec = quest as Record<string, unknown>;
    const messageID = String(rec.messageID ?? "").trim();
    if (!messageID) {
      return NextResponse.json(
        { error: "No board message", message: "Paste a Discord message link in the quest meta and save, or link is empty." },
        { status: 400 }
      );
    }

    const converted = convertParticipantsMapToObject(rec);
    await enrichParticipantsWithUsernames(converted);
    const ok = await updateQuestBoardMessage(
      converted as Parameters<typeof updateQuestBoardMessage>[0]
    );
    if (!ok) {
      return NextResponse.json(
        { error: "Discord update failed", message: "Could not edit the message (wrong link, deleted message, or bot lacks permission)." },
        { status: 502 }
      );
    }

    logger.info("api/admin/quests/[id]/sync-board POST", `Board embed synced for quest ${rec.questID ?? id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("api/admin/quests/[id]/sync-board POST", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Failed to sync board message" }, { status: 500 });
  }
}
