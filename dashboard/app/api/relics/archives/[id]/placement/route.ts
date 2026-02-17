import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";

export const dynamic = "force-dynamic";

/** PATCH /api/relics/archives/[id]/placement — update library map position for an archived relic. Auth required. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const user = session?.user;
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Relic ID required" }, { status: 400 });
  }

  let body: { libraryPositionX?: number; libraryPositionY?: number; libraryDisplaySize?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const libraryPositionX = body.libraryPositionX;
  const libraryPositionY = body.libraryPositionY;
  const libraryDisplaySize = body.libraryDisplaySize;

  console.log("[placement] PATCH request", {
    relicId: id,
    body: { libraryPositionX, libraryPositionY, libraryDisplaySize },
  });

  if (
    libraryPositionX !== undefined &&
    (typeof libraryPositionX !== "number" || libraryPositionX < 0 || libraryPositionX > 100)
  ) {
    return NextResponse.json({ error: "libraryPositionX must be 0–100" }, { status: 400 });
  }
  if (
    libraryPositionY !== undefined &&
    (typeof libraryPositionY !== "number" || libraryPositionY < 0 || libraryPositionY > 100)
  ) {
    return NextResponse.json({ error: "libraryPositionY must be 0–100" }, { status: 400 });
  }
  if (
    libraryDisplaySize !== undefined &&
    (typeof libraryDisplaySize !== "number" || libraryDisplaySize < 2 || libraryDisplaySize > 25)
  ) {
    return NextResponse.json({ error: "libraryDisplaySize must be 2–25 (percent)" }, { status: 400 });
  }

  try {
    await connect();

    const RelicModule = await import("@/models/RelicModel.js");
    const Relic = RelicModule.default || RelicModule;
    const CharacterModule = await import("@/models/CharacterModel.js");
    const Character = CharacterModule.default || CharacterModule;
    const ModCharacterModule = await import("@/models/ModCharacterModel.js");
    const ModCharacter = ModCharacterModule.default || ModCharacterModule;

    const relicIdObj = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
    if (!relicIdObj) {
      return NextResponse.json({ error: "Invalid relic ID" }, { status: 400 });
    }

    const relic = await Relic.findById(relicIdObj);
    if (!relic) {
      console.log("[placement] Relic not found for id:", id);
      return NextResponse.json({ error: "Relic not found" }, { status: 404 });
    }
    if (!relic.archived) {
      console.log("[placement] Relic not archived, skipping", { relicId: id, archived: relic.archived });
      return NextResponse.json({ error: "Only archived relics can be placed on the library map" }, { status: 400 });
    }
    console.log("[placement] Found relic", {
      _id: String(relic._id),
      relicId: relic.relicId,
      archived: relic.archived,
      currentPosition: { x: relic.libraryPositionX, y: relic.libraryPositionY, size: relic.libraryDisplaySize },
    });

    const [isAdmin, isMod] = await Promise.all([
      isAdminUser(user.id),
      isModeratorUser(user.id),
    ]);
    if (isAdmin || isMod) {
      // Mods and admins can move any relic.
    } else {
      const discovererName = (relic.discoveredBy as string)?.trim();
      if (discovererName) {
        const nameRegex = new RegExp(`^${discovererName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
        const discovererChar =
          (await Character.findOne({ name: nameRegex }).select("userId").lean()) ||
          (await ModCharacter.findOne({ name: nameRegex }).select("userId").lean());
        const discovererUserId = discovererChar && !Array.isArray(discovererChar) ? (discovererChar as { userId?: string }).userId : undefined;
        if (discovererUserId !== user.id) {
          return NextResponse.json(
            { error: "Only the discoverer or a mod can update placement" },
            { status: 403 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Only a mod can update placement for this relic" },
          { status: 403 }
        );
      }
    }

    const update: Record<string, number | null> = {};
    if (libraryPositionX !== undefined) update.libraryPositionX = libraryPositionX;
    if (libraryPositionY !== undefined) update.libraryPositionY = libraryPositionY;
    if (libraryDisplaySize !== undefined) update.libraryDisplaySize = libraryDisplaySize;

    if (Object.keys(update).length === 0) {
      console.log("[placement] No fields to update");
      return NextResponse.json({ error: "Provide at least one of libraryPositionX, libraryPositionY, libraryDisplaySize" }, { status: 400 });
    }

    console.log("[placement] Updating relic in DB", { relicId: String(relic._id), update });

    await connect();
    const db = mongoose.connection.db;
    if (!db) {
      console.error("[placement] No database on connection");
      return NextResponse.json({ error: "Database connection missing" }, { status: 500 });
    }
    const collection = db.collection("relics");
    const result = await collection.updateOne(
      { _id: relic._id },
      { $set: update }
    );
    if (result.matchedCount === 0) {
      console.log("[placement] updateOne matched 0 documents");
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    if (result.modifiedCount === 0 && result.matchedCount > 0) {
      console.log("[placement] updateOne matched but modifiedCount 0 (values may be unchanged)");
    }

    const placement = {
      libraryPositionX: libraryPositionX ?? null,
      libraryPositionY: libraryPositionY ?? null,
      libraryDisplaySize: libraryDisplaySize ?? 8,
    };
    console.log("[placement] Persisted via native driver", { relicId: String(relic._id), placement, modifiedCount: result.modifiedCount });

    const verify = await collection.findOne({ _id: relic._id }, { projection: { libraryPositionX: 1, libraryPositionY: 1, libraryDisplaySize: 1 } });
    console.log("[placement] Verify read back", { relicId: String(relic._id), verify });

    return NextResponse.json({ success: true, placement });
  } catch (err) {
    console.error("[api/relics/archives/placement]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update placement" },
      { status: 500 }
    );
  }
}
