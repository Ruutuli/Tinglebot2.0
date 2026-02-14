import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Valid square ID: A-J and 1-12, e.g. H8 */
const SQUARE_ID_REGEX = /^([A-Ja-j])(1[0-2]|[1-9])$/;

/** GET /api/explore/path-images — list path images. Query: partyId (optional), squareId (optional).
 *  When squareId: return latest path for that square (any expedition).
 *  When partyId: return path images for that expedition.
 *  When neither: return latest path per square from map DB (Square.pathImageUrl) — used by /map to show all path images.
 */
export async function GET(request: NextRequest) {
  try {
    await connect();
    const { searchParams } = new URL(request.url);
    const partyId = searchParams.get("partyId")?.trim().slice(0, 32) || null;
    const squareId = searchParams.get("squareId")?.trim().toUpperCase().slice(0, 8) || null;

    const Square =
      mongoose.models.Square ??
      ((await import("@/models/mapModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;
    const MapPathImage =
      mongoose.models.MapPathImage ??
      ((await import("@/models/MapPathImageModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;

    type PathImageDoc = { squareId: string; imageUrl: string; createdAt?: Date };
    let pathImages: Array<{ squareId: string; imageUrl: string; updatedAt: number }> = [];

    if (squareId && /^[A-J](1[0-2]|[1-9])$/.test(squareId)) {
      // Single square: MapPathImage first, fallback to Square.pathImageUrl
      const docs = await MapPathImage.find({ squareId }).sort({ createdAt: -1 }).lean();
      pathImages = (docs as unknown as PathImageDoc[]).map((d) => ({
        squareId: d.squareId,
        imageUrl: d.imageUrl,
        updatedAt: d.createdAt ? new Date(d.createdAt).getTime() : 0,
      }));
      if (pathImages.length === 0) {
        const squareIdRegex = new RegExp(`^${squareId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
        const square = await Square.findOne({ squareId: squareIdRegex }).select("pathImageUrl").lean();
        const url = (square as { pathImageUrl?: string } | null)?.pathImageUrl;
        if (url) pathImages = [{ squareId, imageUrl: url, updatedAt: 0 }];
      }
    } else if (partyId) {
      // By party: MapPathImage for that expedition
      const docs = await MapPathImage.find({ partyId }).sort({ createdAt: -1 }).lean();
      pathImages = (docs as unknown as PathImageDoc[]).map((d) => ({
        squareId: d.squareId,
        imageUrl: d.imageUrl,
        updatedAt: d.createdAt ? new Date(d.createdAt).getTime() : 0,
      }));
    } else {
      // No params: canonical latest per square from map DB (used by /map)
      const squares = await Square.find({ pathImageUrl: { $exists: true, $nin: [null, ""] } })
        .select("squareId pathImageUrl updatedAt")
        .lean();
      pathImages = (squares as unknown as Array<{ squareId: string; pathImageUrl: string; updatedAt?: Date }>).map((s) => ({
        squareId: s.squareId,
        imageUrl: s.pathImageUrl,
        updatedAt: s.updatedAt ? new Date(s.updatedAt).getTime() : 0,
      }));
    }

    return NextResponse.json({ pathImages });
  } catch (err) {
    console.error("[explore/path-images] GET error:", err);
    return NextResponse.json({ error: "Failed to load path images" }, { status: 500 });
  }
}
