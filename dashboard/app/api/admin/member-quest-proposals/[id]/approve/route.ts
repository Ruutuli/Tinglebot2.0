// POST /api/admin/member-quest-proposals/[id]/approve - Approve proposal, create Quest (mod/admin only)

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { postQuestToQuestChannel } from "@/lib/questDiscordPost";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";
import { logger } from "@/utils/logger";

export const dynamic = "force-dynamic";

const QUEST_TYPES = ["Art", "Writing", "Interactive", "RP", "Art / Writing"] as const;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function currentMonthDisplay(): string {
  const d = new Date();
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Normalize proposal type to Quest questType enum */
function toQuestType(type: string): (typeof QUEST_TYPES)[number] {
  const t = String(type || "").trim();
  if (QUEST_TYPES.includes(t as (typeof QUEST_TYPES)[number])) {
    return t as (typeof QUEST_TYPES)[number];
  }
  const lower = t.toLowerCase();
  if (lower === "rp") return "RP";
  if (lower === "art") return "Art";
  if (lower === "writing") return "Writing";
  if (lower === "interactive") return "Interactive";
  return "Interactive";
}

/** Normalize proposal date to "Month YYYY" for Quest (accepts YYYY-MM-DD, YYYY-MM, or "January 2026") */
function formatQuestDate(date: string | null | undefined): string {
  if (!date || typeof date !== "string") return currentMonthDisplay();
  const s = date.trim();
  const yyyyMmDd = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (yyyyMmDd) {
    const monthIdx = parseInt(yyyyMmDd[2], 10) - 1;
    if (monthIdx >= 0 && monthIdx <= 11) return `${MONTH_NAMES[monthIdx]} ${yyyyMmDd[1]}`;
  }
  if (/^[A-Za-z]+\s+\d{4}$/.test(s)) return s;
  return currentMonthDisplay();
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const user = session?.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const [isAdmin, isMod] = await Promise.all([
      isAdminUser(user.id),
      isModeratorUser(user.id),
    ]);
    if (!isAdmin && !isMod) {
      return NextResponse.json(
        { error: "Moderator or admin access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Proposal ID required" }, { status: 400 });
    }

    await connect();
    const MemberQuestProposal = (await import("@/models/MemberQuestProposalModel.js")).default;
    const Quest = (await import("@/models/QuestModel.js")).default;

    const proposal = await MemberQuestProposal.findById(id);
    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }
    if (proposal.status !== "pending") {
      return NextResponse.json(
        { error: "Proposal has already been processed" },
        { status: 400 }
      );
    }

    const questID = await (async () => {
      const memberQuests = await Quest.find({ questID: /^M\d+$/i }).select("questID").lean();
      const nums = (memberQuests as { questID?: string }[])
        .map((q) => {
          const m = (q.questID ?? "").match(/^M(\d+)$/i);
          return m ? parseInt(m[1], 10) : 0;
        })
        .filter((n) => n > 0);
      const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
      return `M${nextNum}`;
    })();

    const timeLimit = (proposal.timeLimit && String(proposal.timeLimit).trim()) || "1 week";
    const questType = toQuestType(proposal.type);
    const date = formatQuestDate(proposal.date);

    const specialNoteParts: string[] = [];
    if (proposal.rewards) specialNoteParts.push(`Rewards (member-supplied): ${proposal.rewards}`);
    if (proposal.specialEquipment) specialNoteParts.push(`Special equipment: ${proposal.specialEquipment}`);
    if (proposal.partySize) specialNoteParts.push(`Party size: ${proposal.partySize}`);
    if (proposal.signUpFormLink) specialNoteParts.push(`Sign-up form: ${proposal.signUpFormLink}`);
    if (proposal.questSummary) specialNoteParts.push(`Summary (for mods): ${proposal.questSummary}`);
    if (proposal.gameplayDescription) specialNoteParts.push(`Gameplay: ${proposal.gameplayDescription}`);
    if (proposal.gameRules) specialNoteParts.push(`Rules: ${proposal.gameRules}`);
    if (proposal.runningEventDescription) specialNoteParts.push(`Running the event: ${proposal.runningEventDescription}`);
    const specialNote = specialNoteParts.length > 0 ? specialNoteParts.join("\n\n") : null;

    const participantCap =
      proposal.partySize != null && proposal.partySize !== ""
        ? parseInt(String(proposal.partySize), 10)
        : null;
    const cap = Number.isNaN(participantCap) ? null : Math.max(1, participantCap ?? 0);

    const location =
      proposal.locations === "ALL"
        ? "Rudania, Inariko, Vhintl"
        : (proposal.locations || "Various");

    const signupDeadline =
      proposal.signupDeadline != null && String(proposal.signupDeadline).trim() !== ""
        ? String(proposal.signupDeadline).trim()
        : null;
    const postRequirement =
      proposal.postRequirement != null && !Number.isNaN(Number(proposal.postRequirement))
        ? Math.max(0, Number(proposal.postRequirement))
        : null;
    const collabAllowed = Boolean(proposal.collabAllowed);
    const collabRule =
      proposal.collabRule != null && String(proposal.collabRule).trim() !== ""
        ? String(proposal.collabRule).trim()
        : null;
    const artWritingMode = proposal.artWritingMode === "either" ? "either" : "both";
    const tableRollName =
      proposal.tableRollName != null && String(proposal.tableRollName).trim() !== ""
        ? String(proposal.tableRollName).trim()
        : null;
    const requiredRolls =
      proposal.requiredRolls != null && !Number.isNaN(Number(proposal.requiredRolls))
        ? Math.max(1, Number(proposal.requiredRolls))
        : 1;

    const questData: Record<string, unknown> = {
      title: proposal.title,
      description: proposal.questDescription || proposal.title,
      rules: proposal.gameRules || null,
      date,
      questType,
      location,
      timeLimit,
      questID,
      status: "draft",
      tokenReward: "N/A",
      itemReward: null,
      itemRewardQty: null,
      itemRewards: [],
      minRequirements: proposal.minRequirements ?? 0,
      createdByUserId: user.id,
      createdByUsername: user.username ?? null,
      isMemberQuest: true,
      runByUserId: proposal.submitterUserId,
      runByUsername: proposal.submitterUsername ?? null,
      specialNote,
      participantCap: cap,
      signupDeadline,
      postRequirement,
      posted: false,
      postedAt: null,
      collabAllowed,
      collabRule,
      artWritingMode,
      tableroll: tableRollName,
      tableRollName,
      requiredRolls,
      botNotes: `Member quest proposal approved from proposal ${id}. Run by: ${proposal.submitterUsername ?? proposal.submitterUserId}.`,
    };

    const QuestModel = Quest as unknown as new (data: Record<string, unknown>) => {
      save: () => Promise<unknown>;
      toObject: () => Record<string, unknown>;
      questID: string;
    };
    const quest = new QuestModel(questData);
    await quest.save();

    const messageId = await postQuestToQuestChannel(quest.toObject() as Record<string, unknown>);
    if (messageId) {
      const q = quest as unknown as { posted: boolean; postedAt: Date | null; messageID: string | null; status: string };
      q.posted = true;
      q.postedAt = new Date();
      q.messageID = messageId;
      q.status = "active";
      await quest.save();
    } else {
      logger.warn(
        "api/admin/member-quest-proposals/[id]/approve",
        `Quest ${quest.questID} created but posting to quest channel failed. Quest left as draft.`
      );
    }

    proposal.status = "approved";
    proposal.reviewedByUserId = user.id;
    proposal.reviewedAt = new Date();
    proposal.approvedQuestId = quest.questID;
    await proposal.save();

    return NextResponse.json({
      success: true,
      message: messageId
        ? "Proposal approved, quest created and posted to the quest channel."
        : "Proposal approved and quest created. Posting to the quest channel failed; quest is saved as draft.",
      questID: quest.questID,
      postedToChannel: !!messageId,
    });
  } catch (e) {
    logger.error(
      "api/admin/member-quest-proposals/[id]/approve",
      e instanceof Error ? e.message : String(e)
    );
    return NextResponse.json(
      { error: "Failed to approve proposal" },
      { status: 500 }
    );
  }
}
