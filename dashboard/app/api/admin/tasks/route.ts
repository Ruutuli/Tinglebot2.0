// ============================================================================
// ------------------- Admin Tasks API -------------------
// GET /api/admin/tasks - List tasks (admin/mod only)
// POST /api/admin/tasks - Create task (admin/mod only)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";
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

    const assignees: Assignee[] = [];
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
      // Auto-assign to the creator if no assignees provided
      assignees.push({
        discordId: user.id,
        username: user.username ?? "Unknown",
        avatar: user.avatar ?? null,
      });
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
