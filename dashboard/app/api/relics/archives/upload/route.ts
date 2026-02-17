import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { gcsUploadService } from "@/lib/services/gcsUploadService";
import {
  validateFileTypes,
  validateFileSizes,
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_BYTES,
} from "@/lib/character-validation";

export const dynamic = "force-dynamic";

/** POST /api/relics/archives/upload — submit appraised relic with art to archive. Auth required. FormData: relicId, file. */
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

  const getStr = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v.trim() : "";
  };

  const relicIdRaw = getStr("relicId");
  const relicId = relicIdRaw.toUpperCase();
  const file = formData.get("file");
  const title = getStr("title");
  const discoveredBy = getStr("discoveredBy");
  const appraisedBy = getStr("appraisedBy");
  const region = getStr("region");
  const square = getStr("square");
  const quadrant = getStr("quadrant");
  const info = getStr("info");

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
    const UserModule = await import("@/models/UserModel.js");
    const User = UserModule.default || UserModule;
    const TokenTransactionModule = await import("@/models/TokenTransactionModel.js");
    const TokenTransaction = TokenTransactionModule.default || TokenTransactionModule;

    const relic = await Relic.findOne({
      $or: [{ relicId }, { relicId: relicIdRaw.trim() }],
    });
    if (!relic) {
      return NextResponse.json({ error: "Relic not found. Check the Relic ID from /relic list in Discord." }, { status: 404 });
    }
    if (!relic.appraised) {
      return NextResponse.json({ error: "This relic has not been appraised yet. Get it appraised in Inariko first." }, { status: 400 });
    }
    if (relic.archived) {
      return NextResponse.json({ error: "This relic is already archived." }, { status: 400 });
    }
    if (relic.deteriorated) {
      return NextResponse.json({ error: "This relic has deteriorated and cannot be archived." }, { status: 400 });
    }

    const discovererName = (relic.discoveredBy as string)?.trim();
    if (!discovererName) {
      return NextResponse.json({ error: "Relic has no discoverer; cannot verify ownership." }, { status: 400 });
    }

    const nameRegex = new RegExp(`^${discovererName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    let discovererChar = await Character.findOne({ name: nameRegex }).select("userId").lean() as { userId?: string } | null;
    if (!discovererChar) {
      discovererChar = await ModCharacter.findOne({ name: nameRegex }).select("userId").lean() as { userId?: string } | null;
    }
    const discovererUserId = discovererChar?.userId;
    const isAdmin = await isAdminUser(user.id);
    if (discovererUserId !== user.id && !isAdmin) {
      return NextResponse.json(
        { error: "Only the character who discovered this relic (or an admin) can submit it to the archives." },
        { status: 403 }
      );
    }

    const buffer = Buffer.from(await (file as Blob).arrayBuffer());
    const relicMongoId = String(relic._id);
    const result = await gcsUploadService.uploadRelicImage(buffer, relicMongoId);

    const wasFirstArchived = (await Relic.countDocuments({ archived: true })) === 0;
    const updateData: Record<string, unknown> = {
      artSubmitted: true,
      imageUrl: result.url,
      archived: true,
      rollOutcome: title,
      discoveredBy,
      appraisedBy,
      appraisalDescription: info,
      region,
      square,
      quadrant,
      ...(wasFirstArchived && { firstCompletionRewardGiven: true }),
    };

    await Relic.findByIdAndUpdate(relic._id, updateData);

    if (wasFirstArchived && discovererUserId) {
      const userDoc = await User.findOne({ discordId: discovererUserId }).exec();
      if (userDoc) {
        const balanceBefore = userDoc.tokens ?? 0;
        const balanceAfter = balanceBefore + 1000;
        userDoc.tokens = balanceAfter;
        await userDoc.save();
        await (TokenTransaction as unknown as { createTransaction: (data: unknown) => Promise<unknown> }).createTransaction({
          userId: discovererUserId,
          amount: 1000,
          type: "earned",
          category: "relic_first_completion",
          description: "First relic archived in Library",
          balanceBefore,
          balanceAfter,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: wasFirstArchived
        ? "Relic archived. You received 1,000 tokens for the first archived relic!"
        : "Relic archived. You can place it on the library map below.",
      relic: {
        _id: relic._id,
        relicId: relic.relicId,
        imageUrl: result.url,
        archived: true,
      },
    });
  } catch (err) {
    console.error("[api/relics/archives/upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to archive relic" },
      { status: 500 }
    );
  }
}
