import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import sharp from "sharp";
import mongoose from "mongoose";
import { connect } from "@/lib/db";

export const dynamic = "force-dynamic";

const SQUARE_W = 2400;
const SQUARE_H = 1666;
const SQUARE_ID_REGEX = /^([A-Ja-j])(1[0-2]|[1-9])$/;
const BASE_LAYER = "MAP_0002_Map-Base";
const GCS_BASE = "https://storage.googleapis.com/tinglebot";

/** Quadrant bounds: left, top, width, height (pixels). Q1=top-left, Q2=top-right, Q3=bottom-left, Q4=bottom-right. */
const QUADRANT_BOUNDS: Record<string, { left: number; top: number; width: number; height: number }> = {
  Q1: { left: 0, top: 0, width: SQUARE_W / 2, height: SQUARE_H / 2 },
  Q2: { left: SQUARE_W / 2, top: 0, width: SQUARE_W / 2, height: SQUARE_H / 2 },
  Q3: { left: 0, top: SQUARE_H / 2, width: SQUARE_W / 2, height: SQUARE_H / 2 },
  Q4: { left: SQUARE_W / 2, top: SQUARE_H / 2, width: SQUARE_W / 2, height: SQUARE_H / 2 },
};

/** GET /api/explore/path-images/quadrant — download cropped quadrant image.
 *  Query: squareId (required), quadrantId (required, Q1–Q4).
 *  Returns the quadrant portion of the latest square image (path image if exists, else base map).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const squareId = searchParams.get("squareId")?.trim().toUpperCase().slice(0, 8) || "";
    const quadrantId = searchParams.get("quadrantId")?.trim().toUpperCase().slice(0, 4) || "";

    if (!SQUARE_ID_REGEX.test(squareId) || !["Q1", "Q2", "Q3", "Q4"].includes(quadrantId)) {
      return NextResponse.json({ error: "Invalid squareId or quadrantId" }, { status: 400 });
    }

    const bounds = QUADRANT_BOUNDS[quadrantId];
    if (!bounds) {
      return NextResponse.json({ error: "Invalid quadrant" }, { status: 400 });
    }

    // Resolve image URL: path image first, then base map
    let imageUrl: string | null = null;

    await connect();
    const MapPathImage =
      mongoose.models.MapPathImage ??
      ((await import("@/models/MapPathImageModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;
    const Square =
      mongoose.models.Square ??
      ((await import("@/models/mapModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;

    const pathDoc = await MapPathImage.findOne({ squareId }).sort({ createdAt: -1 }).lean();
    const pathUrl = pathDoc && typeof (pathDoc as unknown as { imageUrl?: string }).imageUrl === "string"
      ? (pathDoc as unknown as { imageUrl: string }).imageUrl
      : null;
    if (pathUrl) imageUrl = pathUrl;
    if (!imageUrl) {
      const square = await Square.findOne({ squareId: new RegExp(`^${squareId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })
        .select("pathImageUrl image")
        .lean();
      imageUrl = (square as { pathImageUrl?: string } | null)?.pathImageUrl ?? (square as { image?: string } | null)?.image ?? null;
    }
    if (!imageUrl) {
      imageUrl = `${GCS_BASE}/maps/squares/${BASE_LAYER}/${BASE_LAYER}_${squareId}.png`;
    }

    const res = await fetch(imageUrl, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    const buffer = Buffer.from(await res.arrayBuffer());

    const cropped = await sharp(buffer)
      .extract({
        left: Math.floor(bounds.left),
        top: Math.floor(bounds.top),
        width: Math.floor(bounds.width),
        height: Math.floor(bounds.height),
      })
      .png()
      .toBuffer();

    return new NextResponse(new Uint8Array(cropped), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="square-${squareId}-${quadrantId}.png"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[explore/path-images/quadrant] GET error:", err);
    return NextResponse.json({ error: "Failed to generate quadrant image" }, { status: 500 });
  }
}
