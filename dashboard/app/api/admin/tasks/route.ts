// ============================================================================
// ------------------- Admin Tasks API -------------------
// GET /api/admin/tasks - List tasks (admin/mod only)
// POST /api/admin/tasks - Create task (admin/mod only)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";
import { discordApiRequest } from "@/lib/discord";
import { logger } from "@/utils/logger";

const COLUMNS = ["repeating", "todo", "in_progress", "pending", "done"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const FREQUENCIES = ["daily", "weekly", "monthly", "quarterly"] as const;

type Column = (typeof COLUMNS)[number];
type Priority = (typeof PRIORITIES)[number];
type Frequency = (typeof FREQUENCIES)[number];

interface Assignee {
  discordId: string;
  username: string;
  avatar?: string | null;
}

interface ChecklistItem {
  _id?: string;
  text: string;
  checked: boolean;
}

interface CommentInput {
  _id?: string;
  text: string;
  author: {
    discordId: string;
    username: string;
    avatar?: string | null;
  };
  createdAt?: string;
  editedAt?: string | null;
}

interface TaskInput {
  title?: string;
  description?: string;
  column?: Column;
  priority?: Priority;
  dueDate?: string | null;
  assignees?: Assignee[];
  isRepeating?: boolean;
  repeatConfig?: {
    frequency?: Frequency;
  } | null;
  checklist?: ChecklistItem[];
  comments?: CommentInput[];
}

interface GuildMember {
  user?: {
    id: string;
    username: string;
    global_name?: string;
    avatar?: string;
  };
  roles: string[];
}

interface AssignmentRule {
  discordId: string;
  memberName: string;
  keywords: string[];
}

/**
 * Substring match on task title + description; keep in sync with
 * `bot/handlers/modTodoReactionHandler.js`.
 *
 * Duty roster (primary) — tune keywords when duties change:
 * - Fern: Admin Discord, Monthly Updates, NPC Management, Suggestion Box, New Member Management.
 * - Reaver: Website Management, Quests, Member Lore, Lore Management, Reservations (shared).
 * - Ruu: Member Quests Review, Accepting Intros, Bot Management.
 * - Mata: Mod Meeting Minutes, Accepting Applications, Reservations (shared), Quests/Intros (shared).
 * - Toki: FAQs, Graphics, Mechanics & Balancing, Activity Check, Discord Management.
 *
 * Overlapping keywords are intentional (shared threads, backups, or joint review). Multiple
 * rules can match one task; assignees are every mod whose keywords hit and who has mod role.
 */
const AUTO_ASSIGNMENT_RULES: AssignmentRule[] = [
  {
    discordId: "635948726686580747",
    memberName: "Fern",
    keywords: [
      "admin discord",
      "admin inbox",
      "admin messages",
      "suggestion box",
      "suggestions",
      "suggestion review",
      "new member management",
      "new members",
      "onboarding",
      "member onboarding",
      "npc management",
      "npc",
      "npcs",
      "help wanted npc",
      "website management",
      "website",
      "site update",
      "page",
      "rootsofthewild",
      "member quests review",
      "member quest review",
      "member events review",
    ],
  },
  {
    discordId: "308795936530759680",
    memberName: "Reaver",
    keywords: [
      "website management",
      "website",
      "site update",
      "page",
      "rootsofthewild",
      "quests",
      "quest",
      "quest posting",
      "quest planning",
      "member lore",
      "lore review",
      "npc management",
      "npc",
      "npcs",
      "accepting reservations",
      "reservations",
      "mechanic management",
      "balancing",
      "balance",
      "game balance",
      "lore management",
      "lore",
    ],
  },
  {
    discordId: "211219306137124865",
    memberName: "Ruu",
    keywords: [
      "member quests review",
      "member quest review",
      "member events review",
      "accepting intros",
      "intros",
      "introductions",
      "activity check",
      "inactivity check",
      "lore management",
      "lore",
      "bot management",
      "bot",
      "bot update",
      "bot bug",
      "discord management",
      "discord server",
      "server management",
    ],
  },
  {
    discordId: "271107732289880064",
    memberName: "Mata",
    keywords: [
      "mod meeting minutes",
      "meeting notes",
      "accepting reservations",
      "reservations",
      "accepting applications",
      "applications",
      "application review",
      "quests",
      "quest",
      "accepting intros",
      "intros",
      "introductions",
      "faqs management",
      "faq management",
      "faq",
    ],
  },
  {
    discordId: "126088204016156672",
    memberName: "Toki",
    keywords: [
      "trello management",
      "trello",
      "kanban",
      "board management",
      "faqs management",
      "faq management",
      "faq",
      "mechanic management",
      "balancing",
      "balance",
      "game balance",
      "discord management",
      "discord server",
      "server management",
      "graphics creation",
      "graphics",
      "art",
      "design",
      "new member management",
      "new members",
      "onboarding",
      "accepting applications",
      "applications",
      "application review",
    ],
  },
];

const MEMBER_NAME_ALIASES: Record<string, string[]> = {
  "635948726686580747": ["fern"],
  "308795936530759680": ["reaver"],
  "211219306137124865": ["ruu"],
  "271107732289880064": ["mata"],
  "126088204016156672": ["toki"],
};

function normalizeForMatching(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getAutoAssignedRuleKeys(text: string): { discordIds: string[]; names: string[] } {
  const normalizedText = normalizeForMatching(text);
  if (!normalizedText) return { discordIds: [], names: [] };

  const names = new Set<string>();
  const discordIds = new Set<string>();
  for (const rule of AUTO_ASSIGNMENT_RULES) {
    if (rule.keywords.some((keyword) => normalizedText.includes(normalizeForMatching(keyword)))) {
      names.add(rule.memberName.toLowerCase());
      discordIds.add(rule.discordId);
    }
  }

  // Allow explicit name mentions in task text (e.g., "Fern + Reaver")
  for (const rule of AUTO_ASSIGNMENT_RULES) {
    const aliases = MEMBER_NAME_ALIASES[rule.discordId] ?? [rule.memberName.toLowerCase()];
    const hasNameMention = aliases.some((alias) =>
      normalizedText.includes(normalizeForMatching(alias))
    );
    if (hasNameMention) {
      names.add(rule.memberName.toLowerCase());
      discordIds.add(rule.discordId);
    }
  }

  return { discordIds: [...discordIds], names: [...names] };
}

async function fetchAssignableMods(): Promise<Assignee[]> {
  const guildId = process.env.GUILD_ID;
  if (!guildId) return [];

  const roleIds = [process.env.MOD_ROLE_ID, process.env.ADMIN_ROLE_ID].filter(Boolean) as string[];
  if (roleIds.length === 0) return [];

  const members = await discordApiRequest<GuildMember[]>(`/guilds/${guildId}/members?limit=1000`);
  if (!members) return [];

  const mods: Assignee[] = [];
  for (const member of members) {
    if (!member.user) continue;
    const hasRole = roleIds.some((roleId) => member.roles.includes(roleId));
    if (!hasRole) continue;

    mods.push({
      discordId: member.user.id,
      username: member.user.global_name || member.user.username,
      avatar: member.user.avatar
        ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png`
        : null,
    });
  }

  return mods;
}

async function resolveAutoAssignees(title: string, description: string): Promise<Assignee[]> {
  const { discordIds, names } = getAutoAssignedRuleKeys(`${title} ${description}`);
  if (discordIds.length === 0 && names.length === 0) return [];

  const availableMods = await fetchAssignableMods();
  if (availableMods.length === 0) return [];

  return availableMods.filter((mod) => {
    if (discordIds.includes(mod.discordId)) return true;
    // Name fallback if IDs are unavailable for some reason.
    return names.includes(normalizeForMatching(mod.username));
  }
  );
}

async function canAccessTasks(userId: string): Promise<boolean> {
  const [admin, mod] = await Promise.all([
    isAdminUser(userId),
    isModeratorUser(userId),
  ]);
  return admin || mod;
}

// ----------------------------------------------------------------------------
// GET - List all tasks, grouped by column
// ----------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowed = await canAccessTasks(user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin or moderator access required" },
        { status: 403 }
      );
    }

    await connect();
    const ModTask = (await import("@/models/ModTaskModel.js")).default;

    const column = req.nextUrl.searchParams.get("column") as Column | null;
    const assignee = req.nextUrl.searchParams.get("assignee");

    // Build query
    const query: Record<string, unknown> = {};
    if (column && COLUMNS.includes(column)) {
      query.column = column;
    }
    if (assignee) {
      query["assignees.discordId"] = assignee;
    }

    const tasks = await ModTask.find(query)
      .sort({ column: 1, order: 1, createdAt: -1 })
      .lean();

    // Group tasks by column
    const grouped: Record<Column, typeof tasks> = {
      repeating: [],
      todo: [],
      in_progress: [],
      pending: [],
      done: [],
    };

    for (const task of tasks) {
      const col = task.column as Column;
      if (grouped[col]) {
        grouped[col].push(task);
      }
    }

    return NextResponse.json({ tasks, grouped });
  } catch (e) {
    logger.error("api/admin/tasks GET", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// POST - Create new task
// ----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowed = await canAccessTasks(user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin or moderator access required" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as TaskInput;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json(
        { error: "Validation failed", message: "Title is required" },
        { status: 400 }
      );
    }

    if (title.length > 200) {
      return NextResponse.json(
        { error: "Validation failed", message: "Title must be 200 characters or less" },
        { status: 400 }
      );
    }

    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (description.length > 2000) {
      return NextResponse.json(
        { error: "Validation failed", message: "Description must be 2000 characters or less" },
        { status: 400 }
      );
    }

    const column = body.column && COLUMNS.includes(body.column) ? body.column : "todo";
    const priority = body.priority && PRIORITIES.includes(body.priority) ? body.priority : "medium";

    let dueDate: Date | null = null;
    if (body.dueDate) {
      const parsed = new Date(body.dueDate);
      if (!isNaN(parsed.getTime())) {
        dueDate = parsed;
      }
    }

    let assignees: Assignee[] = [];
    if (Array.isArray(body.assignees) && body.assignees.length > 0) {
      for (const a of body.assignees) {
        if (a && typeof a.discordId === "string" && typeof a.username === "string") {
          assignees.push({
            discordId: a.discordId,
            username: a.username,
            avatar: typeof a.avatar === "string" ? a.avatar : null,
          });
        }
      }
    } else {
      const autoAssignees = await resolveAutoAssignees(title, description);
      if (autoAssignees.length > 0) {
        assignees = autoAssignees;
      } else {
        // Fallback: assign to the creator when no routing rule matches
        assignees = [{
          discordId: user.id,
          username: user.username ?? "Unknown",
          avatar: user.avatar ?? null,
        }];
      }
    }

    const isRepeating = Boolean(body.isRepeating);
    let repeatConfig = null;
    if (isRepeating && body.repeatConfig) {
      const freq = body.repeatConfig.frequency;
      if (freq && FREQUENCIES.includes(freq as Frequency)) {
        repeatConfig = {
          frequency: freq as Frequency,
          lastCompleted: null,
          nextDue: dueDate,
        };
      }
    }

    await connect();
    const ModTask = (await import("@/models/ModTaskModel.js")).default;

    // Get next order number for this column
    const maxTask = await ModTask.findOne({ column })
      .sort({ order: -1 })
      .select("order")
      .lean() as { order?: number } | null;
    const order = maxTask?.order != null ? maxTask.order + 1 : 0;

    // Process checklist
    const checklist: { text: string; checked: boolean }[] = [];
    if (Array.isArray(body.checklist)) {
      for (const item of body.checklist) {
        if (item && typeof item.text === "string" && item.text.trim()) {
          checklist.push({
            text: item.text.trim().slice(0, 500),
            checked: Boolean(item.checked),
          });
        }
      }
    }

    // Process comments
    const comments: CommentInput[] = [];
    if (Array.isArray(body.comments)) {
      for (const comment of body.comments) {
        if (
          comment &&
          typeof comment.text === "string" &&
          comment.text.trim() &&
          comment.author &&
          typeof comment.author.discordId === "string" &&
          typeof comment.author.username === "string"
        ) {
          comments.push({
            text: comment.text.trim().slice(0, 2000),
            author: {
              discordId: comment.author.discordId,
              username: comment.author.username,
              avatar: comment.author.avatar ?? null,
            },
            createdAt: comment.createdAt || new Date().toISOString(),
            editedAt: comment.editedAt ?? null,
          });
        }
      }
    }

    const taskData = {
      title,
      description,
      column,
      priority,
      dueDate,
      assignees,
      createdBy: {
        discordId: user.id,
        username: user.username ?? "Unknown",
      },
      isRepeating,
      repeatConfig,
      order,
      checklist,
      comments,
    };

    const task = new ModTask(taskData);
    await task.save();

    return NextResponse.json(task.toObject(), { status: 201 });
  } catch (e) {
    logger.error("api/admin/tasks POST", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
