// ============================================================================
// ------------------- Admin Task by ID API -------------------
// GET /api/admin/tasks/[id] - Get one task (admin/mod only)
// PUT /api/admin/tasks/[id] - Update task (admin/mod only)
// DELETE /api/admin/tasks/[id] - Delete task (admin/mod only)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";
import { logger } from "@/utils/logger";
import { discordApiRequest } from "@/lib/discord";

const COLUMNS = ["repeating", "todo", "in_progress", "pending", "done"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const FREQUENCIES = ["daily", "weekly", "monthly", "quarterly"] as const;

const MOD_TODO_FALLBACK_CHANNEL = "795747760691216384";

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

interface TaskUpdateInput {
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
  order?: number;
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

function calculateNextDue(frequency: Frequency, fromDate: Date = new Date()): Date {
  const next = new Date(fromDate);
  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      break;
  }
  return next;
}

/**
 * Build a Discord CDN avatar URL from user ID and avatar hash
 */
function buildAvatarUrl(userId: string, avatarHash: string | null): string | undefined {
  if (!avatarHash) return undefined;
  if (avatarHash.startsWith("http://") || avatarHash.startsWith("https://")) {
    return avatarHash;
  }
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png`;
}

/**
 * Send a comment to Discord - either as a reply to the original message,
 * or as a standalone message in the fallback channel
 */
async function postCommentToDiscord(
  channelId: string,
  messageId: string | null,
  comment: CommentInput,
  taskTitle: string,
  taskId: string
): Promise<boolean> {
  try {
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://tinglebot.xyz").replace(/\/$/, "");
    const taskUrl = `${baseUrl}/admin/todo?task=${taskId}`;

    const avatarUrl = buildAvatarUrl(comment.author.discordId, comment.author.avatar ?? null);

    const embed = {
      title: `📋 ${taskTitle}`,
      url: taskUrl,
      description: comment.text,
      color: 0x49d59c, // Green accent
      author: {
        name: `${comment.author.username} commented`,
        icon_url: avatarUrl,
      },
      footer: {
        text: "Click the title to view task",
      },
      timestamp: new Date().toISOString(),
    };

    const messagePayload: Record<string, unknown> = {
      embeds: [embed],
    };

    if (messageId) {
      messagePayload.message_reference = {
        message_id: messageId,
        fail_if_not_exists: false,
      };
    }

    const result = await discordApiRequest(
      `channels/${channelId}/messages`,
      "POST",
      messagePayload
    );

    return result !== null;
  } catch (error) {
    logger.error(
      "tasks-api",
      `Failed to post comment to Discord: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Post a checklist item completion to Discord
 */
async function postChecklistUpdateToDiscord(
  channelId: string,
  messageId: string | null,
  itemText: string,
  userId: string,
  username: string,
  userAvatar: string | null,
  taskTitle: string,
  taskId: string,
  checklistProgress: { done: number; total: number }
): Promise<boolean> {
  try {
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://tinglebot.xyz").replace(/\/$/, "");
    const taskUrl = `${baseUrl}/admin/todo?task=${taskId}`;
    const percent = checklistProgress.total > 0 
      ? Math.round((checklistProgress.done / checklistProgress.total) * 100) 
      : 0;

    const avatarUrl = buildAvatarUrl(userId, userAvatar);

    const embed = {
      title: `📋 ${taskTitle}`,
      url: taskUrl,
      description: `✅ **${username}** checked off:\n> ${itemText}`,
      color: 0x49d59c, // Green accent
      fields: [
        {
          name: "Progress",
          value: `${checklistProgress.done}/${checklistProgress.total} (${percent}%)`,
          inline: true,
        },
      ],
      footer: {
        text: "Click the title to view task",
        icon_url: avatarUrl,
      },
      timestamp: new Date().toISOString(),
    };

    const messagePayload: Record<string, unknown> = {
      embeds: [embed],
    };

    if (messageId) {
      messagePayload.message_reference = {
        message_id: messageId,
        fail_if_not_exists: false,
      };
    }

    const result = await discordApiRequest(
      `channels/${channelId}/messages`,
      "POST",
      messagePayload
    );

    return result !== null;
  } catch (error) {
    logger.error(
      "tasks-api",
      `Failed to post checklist update to Discord: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

// ----------------------------------------------------------------------------
// GET - Get one task by ID
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

    const allowed = await canAccessTasks(user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin or moderator access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
    }

    await connect();
    const ModTask = (await import("@/models/ModTaskModel.js")).default;
    const task = await ModTask.findById(id).lean();

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (e) {
    logger.error("api/admin/tasks/[id] GET", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// PUT - Update task
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

    const allowed = await canAccessTasks(user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin or moderator access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
    }

    await connect();
    const ModTask = (await import("@/models/ModTaskModel.js")).default;
    const existingTask = await ModTask.findById(id);

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const body = (await req.json()) as TaskUpdateInput;
    const updates: Record<string, unknown> = {};

    // Title
    if (body.title !== undefined) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) {
        return NextResponse.json(
          { error: "Validation failed", message: "Title cannot be empty" },
          { status: 400 }
        );
      }
      if (title.length > 200) {
        return NextResponse.json(
          { error: "Validation failed", message: "Title must be 200 characters or less" },
          { status: 400 }
        );
      }
      updates.title = title;
    }

    // Description
    if (body.description !== undefined) {
      const description = typeof body.description === "string" ? body.description.trim() : "";
      if (description.length > 2000) {
        return NextResponse.json(
          { error: "Validation failed", message: "Description must be 2000 characters or less" },
          { status: 400 }
        );
      }
      updates.description = description;
    }

    // Column change
    const oldColumn = existingTask.column;
    if (body.column !== undefined && COLUMNS.includes(body.column)) {
      updates.column = body.column;

      // If moving to a different column, assign new order at the end
      if (body.column !== oldColumn && body.order === undefined) {
        const maxTask = await ModTask.findOne({ column: body.column })
          .sort({ order: -1 })
          .select("order")
          .lean() as { order?: number } | null;
        updates.order = maxTask?.order != null ? maxTask.order + 1 : 0;
      }

      // Track who completed the task when moving to done
      if (body.column === "done" && oldColumn !== "done") {
        updates.completedBy = {
          discordId: user.id,
          username: user.username || "Unknown",
          avatar: user.avatar || null,
        };
        updates.completedAt = new Date();
      }
      
      // Clear completion info if moving out of done
      if (body.column !== "done" && oldColumn === "done") {
        updates.completedBy = null;
        updates.completedAt = null;
      }
    }

    // Priority
    if (body.priority !== undefined && PRIORITIES.includes(body.priority)) {
      updates.priority = body.priority;
    }

    // Due date
    if (body.dueDate !== undefined) {
      if (body.dueDate === null) {
        updates.dueDate = null;
      } else {
        const parsed = new Date(body.dueDate);
        if (!isNaN(parsed.getTime())) {
          updates.dueDate = parsed;
        }
      }
    }

    // Assignees
    if (body.assignees !== undefined) {
      const assignees: Assignee[] = [];
      if (Array.isArray(body.assignees)) {
        for (const a of body.assignees) {
          if (a && typeof a.discordId === "string" && typeof a.username === "string") {
            assignees.push({
              discordId: a.discordId,
              username: a.username,
              avatar: typeof a.avatar === "string" ? a.avatar : null,
            });
          }
        }
      }
      updates.assignees = assignees;
    }

    // Repeating config
    if (body.isRepeating !== undefined) {
      updates.isRepeating = Boolean(body.isRepeating);
    }
    if (body.repeatConfig !== undefined) {
      if (body.repeatConfig === null) {
        updates.repeatConfig = null;
      } else if (body.repeatConfig.frequency && FREQUENCIES.includes(body.repeatConfig.frequency as Frequency)) {
        updates.repeatConfig = {
          frequency: body.repeatConfig.frequency,
          lastCompleted: existingTask.repeatConfig?.lastCompleted ?? null,
          nextDue: existingTask.repeatConfig?.nextDue ?? existingTask.dueDate,
        };
      }
    }

    // Order (for drag-drop reordering)
    if (body.order !== undefined && typeof body.order === "number") {
      updates.order = body.order;
    }

    // Checklist - track newly checked items to post to Discord
    const newlyCheckedItems: string[] = [];
    if (body.checklist !== undefined) {
      const checklist: { text: string; checked: boolean }[] = [];
      
      // Build a map of existing checklist items by text for comparison
      const existingChecklistMap = new Map<string, boolean>();
      if (Array.isArray(existingTask.checklist)) {
        for (const item of existingTask.checklist) {
          if (item && typeof item.text === "string") {
            existingChecklistMap.set(item.text.trim(), Boolean(item.checked));
          }
        }
      }
      
      if (Array.isArray(body.checklist)) {
        for (const item of body.checklist) {
          if (item && typeof item.text === "string" && item.text.trim()) {
            const text = item.text.trim().slice(0, 500);
            const isChecked = Boolean(item.checked);
            
            // Check if this item was just checked (wasn't checked before, is checked now)
            const wasChecked = existingChecklistMap.get(text);
            if (isChecked && wasChecked === false) {
              newlyCheckedItems.push(text);
            }
            
            checklist.push({
              text,
              checked: isChecked,
            });
          }
        }
      }
      updates.checklist = checklist;
    }

    // Comments - track new ones to post to Discord
    const newCommentsToPost: CommentInput[] = [];
    if (body.comments !== undefined) {
      const comments: CommentInput[] = [];
      const existingCommentIds = new Set(
        (existingTask.comments || []).map((c: { _id?: { toString(): string } }) => c._id?.toString())
      );
      
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
            const processedComment: CommentInput = {
              text: comment.text.trim().slice(0, 2000),
              author: {
                discordId: comment.author.discordId,
                username: comment.author.username,
                avatar: comment.author.avatar ?? null,
              },
              createdAt: comment.createdAt || new Date().toISOString(),
              editedAt: comment.editedAt ?? null,
            };
            
            // Check if this is a new comment (no _id or _id not in existing)
            if (!comment._id || !existingCommentIds.has(comment._id)) {
              newCommentsToPost.push(processedComment);
            }
            
            comments.push(processedComment);
          }
        }
      }
      updates.comments = comments;
    }

    // Handle repeating task completion
    const newColumn = updates.column ?? existingTask.column;
    const wasRepeating = existingTask.isRepeating;
    const isRepeating = updates.isRepeating ?? wasRepeating;
    const repeatConfig: { frequency?: Frequency } | null | undefined =
      updates.repeatConfig ?? existingTask.repeatConfig;

    // If moving a repeating task to done, handle auto-recreation
    if (
      newColumn === "done" &&
      oldColumn !== "done" &&
      isRepeating &&
      repeatConfig?.frequency
    ) {
      updates["repeatConfig.lastCompleted"] = new Date();
      updates["repeatConfig.nextDue"] = calculateNextDue(repeatConfig.frequency);
    }

    const updatedTask = await ModTask.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    // If this was a repeating task that was marked done, create a new one
    if (
      newColumn === "done" &&
      oldColumn !== "done" &&
      isRepeating &&
      repeatConfig?.frequency
    ) {
      const nextDue = calculateNextDue(repeatConfig.frequency);
      const maxTask = await ModTask.findOne({ column: "todo" })
        .sort({ order: -1 })
        .select("order")
        .lean() as { order?: number } | null;
      const newOrder = maxTask?.order != null ? maxTask.order + 1 : 0;

      const newTaskData = {
        title: existingTask.title,
        description: existingTask.description,
        column: "todo",
        priority: existingTask.priority,
        dueDate: nextDue,
        assignees: existingTask.assignees,
        createdBy: existingTask.createdBy,
        isRepeating: true,
        repeatConfig: {
          frequency: repeatConfig.frequency,
          lastCompleted: new Date(),
          nextDue: nextDue,
        },
        order: newOrder,
      };

      const newTask = new ModTask(newTaskData);
      await newTask.save();

      // Post new comments to Discord (don't await - fire and forget)
      if (newCommentsToPost.length > 0) {
        const channelId = existingTask.discordSource?.channelId || MOD_TODO_FALLBACK_CHANNEL;
        const messageId = existingTask.discordSource?.messageId || null;
        for (const comment of newCommentsToPost) {
          postCommentToDiscord(
            channelId,
            messageId,
            comment,
            existingTask.title,
            existingTask._id.toString()
          ).catch(() => {}); // Ignore errors
        }
      }

      // Post checklist updates to Discord (don't await - fire and forget)
      if (newlyCheckedItems.length > 0) {
        const channelId = existingTask.discordSource?.channelId || MOD_TODO_FALLBACK_CHANNEL;
        const messageId = existingTask.discordSource?.messageId || null;
        const finalChecklist: { text: string; checked: boolean }[] = 
          Array.isArray(updates.checklist) ? updates.checklist : 
          Array.isArray(existingTask.checklist) ? existingTask.checklist : [];
        const checklistProgress = {
          done: finalChecklist.filter((i) => i.checked).length,
          total: finalChecklist.length,
        };
        for (const itemText of newlyCheckedItems) {
          postChecklistUpdateToDiscord(
            channelId,
            messageId,
            itemText,
            user.id,
            user.username || "Unknown",
            user.avatar || null,
            existingTask.title,
            existingTask._id.toString(),
            checklistProgress
          ).catch(() => {}); // Ignore errors
        }
      }

      return NextResponse.json({
        task: updatedTask,
        newTask: newTask.toObject(),
        message: "Repeating task completed and new instance created",
      });
    }

    // Post new comments to Discord (don't await - fire and forget)
    if (newCommentsToPost.length > 0) {
      const channelId = existingTask.discordSource?.channelId || MOD_TODO_FALLBACK_CHANNEL;
      const messageId = existingTask.discordSource?.messageId || null;
      for (const comment of newCommentsToPost) {
        postCommentToDiscord(
          channelId,
          messageId,
          comment,
          existingTask.title,
          existingTask._id.toString()
        ).catch(() => {}); // Ignore errors
      }
    }

    // Post checklist updates to Discord (don't await - fire and forget)
    if (newlyCheckedItems.length > 0) {
      const channelId = existingTask.discordSource?.channelId || MOD_TODO_FALLBACK_CHANNEL;
      const messageId = existingTask.discordSource?.messageId || null;
      const finalChecklist: { text: string; checked: boolean }[] = 
        Array.isArray(updates.checklist) ? updates.checklist : 
        Array.isArray(existingTask.checklist) ? existingTask.checklist : [];
      const checklistProgress = {
        done: finalChecklist.filter((i) => i.checked).length,
        total: finalChecklist.length,
      };
      for (const itemText of newlyCheckedItems) {
        postChecklistUpdateToDiscord(
          channelId,
          messageId,
          itemText,
          user.id,
          user.username || "Unknown",
          user.avatar || null,
          existingTask.title,
          existingTask._id.toString(),
          checklistProgress
        ).catch(() => {}); // Ignore errors
      }
    }

    return NextResponse.json(updatedTask);
  } catch (e) {
    logger.error("api/admin/tasks/[id] PUT", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// DELETE - Delete task
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

    const allowed = await canAccessTasks(user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin or moderator access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
    }

    await connect();
    const ModTask = (await import("@/models/ModTaskModel.js")).default;
    const task = await ModTask.findByIdAndDelete(id);

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted: id });
  } catch (e) {
    logger.error("api/admin/tasks/[id] DELETE", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}
