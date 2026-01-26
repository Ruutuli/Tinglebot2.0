// ============================================================================
// ------------------- Notifications API Route -------------------
// ============================================================================
//
// GET /api/users/notifications — fetch current user's notifications.
// PATCH /api/users/notifications — mark notifications as read.
// DELETE /api/users/notifications — delete notifications.
// Uses session Discord ID (userId) to query NotificationModel.

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logger } from "@/utils/logger";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type NotificationDocument = {
  _id: unknown;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
};

type NotificationResponse = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
};

type NotificationModel = {
  find: (filter: { userId: string }) => {
    sort: (sort: { createdAt: number }) => {
      limit: (limit: number) => {
        lean: () => Promise<NotificationDocument[]>;
      };
    };
  };
  updateMany: (
    filter: { userId: string; read: boolean },
    update: { $set: { read: boolean; readAt: Date } }
  ) => Promise<unknown>;
  updateOne: (
    filter: { _id: unknown; userId: string },
    update: { $set: { read: boolean; readAt: Date } }
  ) => Promise<{ matchedCount: number }>;
  deleteMany: (filter: { userId: string }) => Promise<{ deletedCount: number }>;
  deleteOne: (filter: { _id: unknown; userId: string }) => Promise<{ deletedCount: number }>;
};

type PatchRequestBody = {
  notificationId?: unknown;
  markAll?: boolean;
};

type DeleteRequestBody = {
  notificationId?: unknown;
  deleteAll?: boolean;
};

// ============================================================================
// ------------------- Helpers -------------------
// ============================================================================

// ------------------- Get User ID ------------------
// Validates session and returns userId, or null if unauthorized

async function getUserId(): Promise<string | null> {
  const session = await getSession();
  return session.user?.id || null;
}

// ------------------- Get Notification Model ------------------
// Connects to database and returns Notification model

async function getNotificationModel(): Promise<NotificationModel> {
  await connect();
  const Notification = (await import("@/models/NotificationModel.js")).default;
  return Notification as NotificationModel;
}

// ------------------- Normalize Error ------------------
// Converts unknown error to Error instance

function normalizeError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

// ------------------- Handle Error ------------------
// Logs error and returns error response

function handleError(
  operation: string,
  err: unknown,
  defaultMessage: string
): NextResponse {
  const error = normalizeError(err);
  logger.error(`[notifications/route.ts]❌ ${operation}:`, error.message);
  return NextResponse.json({ error: defaultMessage }, { status: 500 });
}

// ------------------- Transform Notification ------------------
// Converts MongoDB document to API response format

function transformNotification(doc: NotificationDocument): NotificationResponse {
  return {
    id: String(doc._id),
    type: doc.type,
    title: doc.title,
    message: doc.message,
    read: doc.read,
    createdAt: doc.createdAt,
  };
}

// ============================================================================
// ------------------- Route Handlers -------------------
// ============================================================================

// ------------------- GET Handler ------------------
// Fetches current user's notifications

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const Notification = await getNotificationModel();
    const docs = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const notifications = docs.map(transformNotification);
    return NextResponse.json({ notifications });
  } catch (err: unknown) {
    return handleError("Failed to fetch notifications", err, "Failed to fetch notifications");
  }
}

// ------------------- PATCH Handler ------------------
// Marks notifications as read

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as PatchRequestBody;
    const { notificationId, markAll } = body;

    const Notification = await getNotificationModel();

    if (markAll) {
      await Notification.updateMany(
        { userId, read: false },
        { $set: { read: true, readAt: new Date() } }
      );
      return NextResponse.json({ success: true });
    }

    if (notificationId) {
      const result = await Notification.updateOne(
        { _id: notificationId, userId },
        { $set: { read: true, readAt: new Date() } }
      );

      if (result.matchedCount === 0) {
        return NextResponse.json(
          { error: "Notification not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Either notificationId or markAll must be provided" },
      { status: 400 }
    );
  } catch (err) {
    return handleError("Failed to update notifications", err, "Failed to update notifications");
  }
}

// ------------------- DELETE Handler ------------------
// Deletes notifications

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: DeleteRequestBody = {};
    try {
      body = (await request.json()) as DeleteRequestBody;
    } catch {
      // Body parsing failed, use empty object
    }

    const { notificationId, deleteAll } = body;
    const Notification = await getNotificationModel();

    if (deleteAll) {
      const result = await Notification.deleteMany({ userId });
      return NextResponse.json({
        success: true,
        deletedCount: result.deletedCount,
      });
    }

    if (notificationId) {
      const result = await Notification.deleteOne({
        _id: notificationId,
        userId,
      });

      if (result.deletedCount === 0) {
        return NextResponse.json(
          { error: "Notification not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Either notificationId or deleteAll must be provided" },
      { status: 400 }
    );
  } catch (err: unknown) {
    return handleError("Failed to delete notifications", err, "Failed to delete notifications");
  }
}
