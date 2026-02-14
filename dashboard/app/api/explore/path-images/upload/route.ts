import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import sharp from "sharp";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { gcsUploadService } from "@/lib/services/gcsUploadService";
import { notifyPathDrawn } from "@/lib/pathMonitorNotify";

export const dynamic = "force-dynamic";

const SQUARE_ID_REGEX = /^([A-Ja-j])(1[0-2]|[1-9])$/;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const SQUARE_W = 2400;
const SQUARE_H = 1666;
const BASE_LAYER = "MAP_0002_Map-Base";
const GCS_BASE = "https://storage.googleapis.com/tinglebot";

/** Quadrant bounds: left, top, width, height (pixels). Q1=top-left, Q2=top-right, Q3=bottom-left, Q4=bottom-right. */
const QUADRANT_BOUNDS: Record<string, { left: number; top: number; width: number; height: number }> = {
  Q1: { left: 0, top: 0, width: SQUARE_W / 2, height: SQUARE_H / 2 },
  Q2: { left: SQUARE_W / 2, top: 0, width: SQUARE_W / 2, height: SQUARE_H / 2 },
  Q3: { left: 0, top: SQUARE_H / 2, width: SQUARE_W / 2, height: SQUARE_H / 2 },
  Q4: { left: SQUARE_W / 2, top: SQUARE_H / 2, width: SQUARE_W / 2, height: SQUARE_H / 2 },
};

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
      await connect();
      const MapPathImage =
        mongoose.models.MapPathImage ??
        ((await import("@/models/MapPathImageModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;
      const Square =
        mongoose.models.Square ??
        ((await import("@/models/mapModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;

      let imageUrl: string | null = null;
      const pathDoc = await MapPathImage.findOne({ squareId }).sort({ createdAt: -1 }).lean();
      const pathUrl = pathDoc && typeof (pathDoc as unknown as { imageUrl?: string }).imageUrl === "string"
        ? (pathDoc as unknown as { imageUrl: string }).imageUrl
        : null;
      if (pathUrl) imageUrl = pathUrl;
      if (!imageUrl) {
        const square = await Square.findOne({
          squareId: new RegExp(`^${squareId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
        })
          .select("pathImageUrl image")
          .lean();
        imageUrl =
          (square as { pathImageUrl?: string } | null)?.pathImageUrl ??
          (square as { image?: string } | null)?.image ??
          null;
      }
      if (!imageUrl) {
        imageUrl = `${GCS_BASE}/maps/squares/${BASE_LAYER}/${BASE_LAYER}_${squareId}.png`;
      }

      const res = await fetch(imageUrl, { cache: "no-store" });
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

    await connect();
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

    // Save path image URL to map database (Square/exploringMap) so it's the canonical latest for this square
    const Square =
      mongoose.models.Square ??
      ((await import("@/models/mapModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;
    const squareIdRegex = new RegExp(`^${squareId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    await Square.updateOne(
      { squareId: squareIdRegex },
      { $set: { pathImageUrl: result.url, updatedAt: new Date() } }
    );

    // Failsafe: mark on the party that a path image was uploaded for this square so the "draw path" prompt stays hidden
    const Party =
      mongoose.models.Party ??
      ((await import("@/models/PartyModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;
    await Party.findOneAndUpdate(
      { partyId: safePartyId },
      { $addToSet: { pathImageUploadedSquares: squareId } },
      { new: true }
    );

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

    return NextResponse.json({ success: true, url: result.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upload path image";
    console.error("[explore/path-images/upload] error:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
