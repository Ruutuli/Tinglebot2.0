import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Valid square ID: A-J and 1-12, e.g. H8 */
const SQUARE_ID_REGEX = /^([A-Ja-j])(1[0-2]|[1-9])$/;

/** GET /api/explore/path-images — list path images. Query: partyId (optional). */
export async function GET(request: NextRequest) {
  try {
    await connect();
    const { searchParams } = new URL(request.url);
    const partyId = searchParams.get("partyId")?.trim().slice(0, 32) || null;

    const MapPathImage =
      mongoose.models.MapPathImage ??
      ((await import("@/models/MapPathImageModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;

    const filter: Record<string, unknown> = {};
    if (partyId) filter.partyId = partyId;

    const docs = await MapPathImage.find(filter).sort({ createdAt: -1 }).lean();
    type PathImageDoc = { squareId: string; imageUrl: string; createdAt?: Date };
    const pathImages = (docs as unknown as PathImageDoc[]).map((d) => ({
      squareId: d.squareId,
      imageUrl: d.imageUrl,
      updatedAt: d.createdAt ? new Date(d.createdAt).getTime() : 0,
    }));

    return NextResponse.json({ pathImages });
  } catch (err) {
    console.error("[explore/path-images] GET error:", err);
    return NextResponse.json({ error: "Failed to load path images" }, { status: 500 });
  }
}
