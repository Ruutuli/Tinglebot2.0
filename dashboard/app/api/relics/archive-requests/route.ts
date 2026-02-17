import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";
import { gcsUploadService } from "@/lib/services/gcsUploadService";
import {
  validateFileTypes,
  validateFileSizes,
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_BYTES,
} from "@/lib/character-validation";
import { notifyRelicArchiveRequest } from "@/lib/relicArchiveNotify";

export const dynamic = "force-dynamic";

const getStr = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
};

/** POST /api/relics/archive-requests — submit relic for mod approval (upload image, create pending request). */
export async function POST(request: NextRequest) {
  const session = await getSession();
  const user = session?.user;
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!gcsUploadService.isConfigured()) {
    return NextResponse.json(
      { error: "Upload service not configured. Contact an administrator." },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const relicIdRaw = getStr(formData, "relicId");
  const relicId = relicIdRaw.toUpperCase();
  const file = formData.get("file");
  const title = getStr(formData, "title");
  const discoveredBy = getStr(formData, "discoveredBy");
  const appraisedBy = getStr(formData, "appraisedBy");
  const region = getStr(formData, "region");
  const square = getStr(formData, "square");
  const quadrant = getStr(formData, "quadrant");
  const info = getStr(formData, "info");
  const libraryPositionXRaw = formData.get("libraryPositionX");
  const libraryPositionYRaw = formData.get("libraryPositionY");
  const libraryDisplaySizeRaw = formData.get("libraryDisplaySize");
  const libraryPositionX = typeof libraryPositionXRaw === "string" ? parseFloat(libraryPositionXRaw) : NaN;
  const libraryPositionY = typeof libraryPositionYRaw === "string" ? parseFloat(libraryPositionYRaw) : NaN;
  const libraryDisplaySize = typeof libraryDisplaySizeRaw === "string" ? parseFloat(libraryDisplaySizeRaw) : 8;

  if (!relicId) {
    return NextResponse.json({ error: "Relic ID is required (e.g. R473582)" }, { status: 400 });
  }
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return NextResponse.json({ error: "Image file is required" }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "Title (relic name) is required" }, { status: 400 });
  }
  if (!discoveredBy) {
    return NextResponse.json({ error: "Discovered By is required" }, { status: 400 });
  }
  if (!appraisedBy) {
    return NextResponse.json({ error: "Appraised By is required" }, { status: 400 });
  }
  if (!info) {
    return NextResponse.json({ error: "Info (description) is required" }, { status: 400 });
  }
  if (
    typeof libraryPositionX !== "number" ||
    Number.isNaN(libraryPositionX) ||
    libraryPositionX < 0 ||
    libraryPositionX > 100
  ) {
    return NextResponse.json(
      { error: "Map position is required. Click the library map to choose where your relic will appear." },
      { status: 400 }
    );
  }
  if (
    typeof libraryPositionY !== "number" ||
    Number.isNaN(libraryPositionY) ||
    libraryPositionY < 0 ||
    libraryPositionY > 100
  ) {
    return NextResponse.json(
      { error: "Map position is required. Click the library map to choose where your relic will appear." },
      { status: 400 }
    );
  }
  const size = Number.isNaN(libraryDisplaySize) ? 8 : Math.max(2, Math.min(25, libraryDisplaySize));

  const fileValidation = validateFileTypes([file as File], [...ALLOWED_IMAGE_TYPES]);
  if (!fileValidation.ok) {
    return NextResponse.json({ error: fileValidation.error }, { status: 400 });
  }
  const sizeValidation = validateFileSizes([file as File], MAX_FILE_BYTES);
  if (!sizeValidation.ok) {
    return NextResponse.json({ error: sizeValidation.error }, { status: 400 });
  }

  try {
    await connect();

    const RelicModule = await import("@/models/RelicModel.js");
    const Relic = RelicModule.default || RelicModule;
    const CharacterModule = await import("@/models/CharacterModel.js");
    const Character = CharacterModule.default || CharacterModule;
    const ModCharacterModule = await import("@/models/ModCharacterModel.js");
    const ModCharacter = ModCharacterModule.default || ModCharacterModule;
    const RelicArchiveRequestModule = await import("@/models/RelicArchiveRequestModel.js");
    const RelicArchiveRequest = RelicArchiveRequestModule.default || RelicArchiveRequestModule;

    const relic = await Relic.findOne({
      $or: [{ relicId }, { relicId: relicIdRaw.trim() }],
    });
    if (!relic) {
      return NextResponse.json(
        { error: "Relic not found. Check the Relic ID from /relic list in Discord." },
        { status: 404 }
      );
    }
    if (!relic.appraised) {
      return NextResponse.json(
        { error: "This relic has not been appraised yet. Get it appraised in Inariko first." },
        { status: 400 }
      );
    }
    if (relic.archived) {
      return NextResponse.json({ error: "This relic is already archived." }, { status: 400 });
    }
    if (relic.deteriorated) {
      return NextResponse.json({ error: "This relic has deteriorated and cannot be archived." }, { status: 400 });
    }

    const discovererName = (relic.discoveredBy as string)?.trim();
    if (!discovererName) {
      return NextResponse.json(
        { error: "Relic has no discoverer; cannot verify ownership." },
        { status: 400 }
      );
    }

    const nameRegex = new RegExp(
      `^${discovererName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i"
    );
    let discovererChar = (await Character.findOne({ name: nameRegex })
      .select("userId")
      .lean()) as { userId?: string } | null;
    if (!discovererChar) {
      discovererChar = (await ModCharacter.findOne({ name: nameRegex })
        .select("userId")
        .lean()) as { userId?: string } | null;
    }
    const discovererUserId = discovererChar?.userId;
    const isAdmin = await isAdminUser(user.id);
    if (discovererUserId !== user.id && !isAdmin) {
      return NextResponse.json(
        {
          error:
            "Only the character who discovered this relic (or an admin) can submit it to the archives.",
        },
        { status: 403 }
      );
    }

    // Optional: prevent duplicate pending request for same relic
    const existing = await RelicArchiveRequest.findOne({
      relicId: relic.relicId || relicId,
      status: "pending",
    });
    if (existing) {
      return NextResponse.json(
        { error: "This relic already has a pending archive request. Wait for mod approval or contact a mod." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await (file as Blob).arrayBuffer());
    const relicMongoId = String(relic._id);
    const result = await gcsUploadService.uploadRelicImage(buffer, relicMongoId);

    await RelicArchiveRequest.create({
      relicId: relic.relicId || relicId,
      relicMongoId: relic._id,
      submitterUserId: user.id,
      title,
      discoveredBy,
      appraisedBy,
      region,
      square,
      quadrant,
      info,
      imageUrl: result.url,
      status: "pending",
      libraryPositionX,
      libraryPositionY,
      libraryDisplaySize: size,
    });

    notifyRelicArchiveRequest({
      title,
      relicId: relic.relicId || relicId,
      discoveredBy,
      appraisedBy,
      region: region || undefined,
      square: square || undefined,
      quadrant: quadrant || undefined,
      infoSnippet: info || undefined,
      libraryPositionX,
      libraryPositionY,
      libraryDisplaySize: size,
    });

    return NextResponse.json({
      success: true,
      message: "Submitted for mod approval. A moderator will review and approve to add it to the Library Archives.",
    });
  } catch (err) {
    console.error("[api/relics/archive-requests]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to submit" },
      { status: 500 }
    );
  }
}

/** GET /api/relics/archive-requests — list pending requests (mods only). */
export async function GET() {
  const session = await getSession();
  const user = session?.user;
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const [isAdmin, isMod] = await Promise.all([
    isAdminUser(user.id),
    isModeratorUser(user.id),
  ]);
  if (!isAdmin && !isMod) {
    return NextResponse.json({ error: "Moderator or admin access required" }, { status: 403 });
  }

  try {
    await connect();
    const RelicArchiveRequestModule = await import("@/models/RelicArchiveRequestModel.js");
    const RelicArchiveRequest = RelicArchiveRequestModule.default || RelicArchiveRequestModule;

    const requests = await RelicArchiveRequest.find({ status: "pending" })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(requests);
  } catch (err) {
    console.error("[api/relics/archive-requests GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch archive requests" },
      { status: 500 }
    );
  }
}
