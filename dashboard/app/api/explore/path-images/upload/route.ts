import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import sharp from "sharp";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { gcsUploadService } from "@/lib/services/gcsUploadService";
import { notifyPathDrawn } from "@/lib/pathMonitorNotify";
import {
  SQUARE_ID_REGEX,
  QUADRANT_BOUNDS,
  getPathImageUrlForSquare,
} from "@/lib/explorePathImageConstants";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/** POST /api/explore/path-images/upload — upload path image. Auth required. FormData: file, partyId, squareId[, quadrantId].
 *  If quadrantId (Q1–Q4) is provided, composites the uploaded image onto the full square at that quadrant position. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  const user = session?.user;
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!gcsUploadService.isConfigured()) {
    return NextResponse.json(
      {
        error:
          "Upload service not configured. Set GCP_PROJECT_ID and GCP_BUCKET_NAME (and GCS_CREDENTIALS or GCS_KEY_FILE_PATH) in the dashboard environment.",
      },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const partyId = typeof formData.get("partyId") === "string" ? formData.get("partyId") as string : "";
  const squareIdRaw = typeof formData.get("squareId") === "string" ? formData.get("squareId") as string : "";
  const squareId = squareIdRaw.trim().toUpperCase().match(SQUARE_ID_REGEX)?.[0] ?? "";
  const quadrantIdRaw = typeof formData.get("quadrantId") === "string" ? formData.get("quadrantId") as string : "";
  const quadrantId = ["Q1", "Q2", "Q3", "Q4"].includes(quadrantIdRaw.trim().toUpperCase())
    ? quadrantIdRaw.trim().toUpperCase()
    : null;

  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return NextResponse.json({ error: "Missing or invalid file" }, { status: 400 });
  }
  if (!partyId.trim()) {
    return NextResponse.json({ error: "Missing partyId" }, { status: 400 });
  }
  if (!squareId) {
    return NextResponse.json({ error: "Invalid squareId; use format like H8 (A–J, 1–12)" }, { status: 400 });
  }

  const safePartyId = partyId.trim().slice(0, 32);
  let buf = Buffer.from(await (file as Blob).arrayBuffer());
  if (buf.length > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
  }

  try {
    if (quadrantId) {
      const imageUrl = await getPathImageUrlForSquare(squareId);

      const res = await fetch(imageUrl, { next: { revalidate: 3600 } });
      if (!res.ok) {
        return NextResponse.json({ error: "Could not load current square image to composite quadrant" }, { status: 502 });
      }
      const baseBuf = Buffer.from(await res.arrayBuffer());
      const bounds = QUADRANT_BOUNDS[quadrantId];
      const quadrantBuf = await sharp(buf)
        .resize(Math.floor(bounds.width), Math.floor(bounds.height), { fit: "fill" })
        .png()
        .toBuffer();
      const merged = await sharp(baseBuf)
        .composite([{ input: quadrantBuf, left: Math.floor(bounds.left), top: Math.floor(bounds.top) }])
        .png()
        .toBuffer();
      buf = Buffer.from(merged);
    }

    const result = await gcsUploadService.uploadPathImage(buf, safePartyId, squareId);
    console.log("[explore/path-images/upload] GCS upload OK:", result.url);

    const conn = await connect();
    const db = conn.connection.db;
    const dbName = db?.databaseName ?? "unknown";
    console.log("[explore/path-images/upload] DB:", dbName, "partyId:", safePartyId, "squareId:", squareId);
    if (!db) {
      console.error("[explore/path-images/upload] No DB on connection.");
      return NextResponse.json({ error: "Database connection not ready" }, { status: 503 });
    }

    const MapPathImage =
      mongoose.models.MapPathImage ??
      ((await import("@/models/MapPathImageModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;

    await MapPathImage.findOneAndUpdate(
      { partyId: safePartyId, squareId },
      {
        partyId: safePartyId,
        squareId,
        imageUrl: result.url,
        discordId: user.id,
        createdAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Save path image URL to map database (exploringMap) — use native driver so pathImageUrl is actually persisted
    const exploringMapCollection = db.collection("exploringMap");
    const squareUpdateResult = await exploringMapCollection.updateOne(
      { squareId },
      { $set: { pathImageUrl: result.url, updatedAt: new Date() } }
    );
    console.log("[explore/path-images/upload] Square update:", { matched: squareUpdateResult.matchedCount, modified: squareUpdateResult.modifiedCount });
    if (squareUpdateResult.matchedCount === 0) {
      console.warn("[explore/path-images/upload] Square not found for squareId:", squareId, "- pathImageUrl not saved. Check exploringMap has a doc with this squareId.");
    }

    // Mark on the party that a path image was uploaded for this square so the "draw path" prompt stays hidden.
    const partyCollection = db.collection("parties");
    const partyResult = await partyCollection.updateOne(
      { partyId: safePartyId },
      { $addToSet: { pathImageUploadedSquares: squareId } }
    );
    const partyUpdated = partyResult.matchedCount > 0;
    if (!partyUpdated) {
      console.warn("[explore/path-images/upload] Party not found for partyId:", safePartyId, "- pathImageUploadedSquares not updated. Check DB name above.");
    } else {
      console.log("[explore/path-images/upload] Party update: matched", partyResult.matchedCount, "modified", partyResult.modifiedCount);
    }

    const userLabel =
      (user as { global_name?: string | null }).global_name?.trim() ||
      user.username?.trim() ||
      user.id ||
      "unknown";
    notifyPathDrawn({
      partyId: safePartyId,
      userLabel,
      kind: "image",
      squareId,
      quadrantId: quadrantId ?? null,
      imageUrl: result.url,
    });

    const res: { success: boolean; url: string; _debug?: { db: string; square: { matched: number; modified: number }; party: { updated: boolean } } } = {
      success: true,
      url: result.url,
    };
    if (process.env.NODE_ENV !== "production") {
      res._debug = {
        db: dbName,
        square: { matched: squareUpdateResult.matchedCount, modified: squareUpdateResult.modifiedCount },
        party: { updated: partyUpdated },
      };
    }
    return NextResponse.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upload path image";
    console.error("[explore/path-images/upload] error:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
