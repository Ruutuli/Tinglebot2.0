import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { gcsUploadService } from "@/lib/services/gcsUploadService";

export const dynamic = "force-dynamic";

const SQUARE_ID_REGEX = /^([A-Ja-j])(1[0-2]|[1-9])$/;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/** POST /api/explore/path-images/upload — upload path image. Auth required. FormData: file, partyId, squareId. */
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
  const buf = Buffer.from(await (file as Blob).arrayBuffer());
  if (buf.length > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
  }

  try {
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

    return NextResponse.json({ success: true, url: result.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upload path image";
    console.error("[explore/path-images/upload] error:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
