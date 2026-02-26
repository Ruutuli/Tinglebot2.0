import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  SQUARE_ID_REGEX,
  QUADRANT_BOUNDS,
  getPathImageUrlForSquare,
} from "@/lib/explorePathImageConstants";

export const dynamic = "force-dynamic";

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

    const imageUrl = await getPathImageUrlForSquare(squareId);

    const res = await fetch(imageUrl, { next: { revalidate: 3600 } });
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
