import { NextResponse } from "next/server";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";
import { userOwnsCharacterName } from "@/lib/crafting-request-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    const user = session.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const characterName = (url.searchParams.get("characterName") ?? "").trim();
    if (!characterName) {
      return NextResponse.json({ error: "characterName is required" }, { status: 400 });
    }

    const owns = await userOwnsCharacterName(user.id, characterName);
    if (!owns) {
      return NextResponse.json({ error: "That OC is not yours" }, { status: 403 });
    }

    await connect();
    const Character = (await import("@/models/CharacterModel.js")).default;
    const ModCharacterModule = await import("@/models/ModCharacterModel.js");
    const ModCharacter = ModCharacterModule.default || ModCharacterModule;

    const esc = characterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRe = new RegExp(`^${esc}$`, "i");

    let charDoc = await Character.findOne({ userId: user.id, name: nameRe })
      .select("_id name")
      .lean<{ _id: mongoose.Types.ObjectId; name: string } | null>();

    if (!charDoc) {
      charDoc = await ModCharacter.findOne({ userId: user.id, name: nameRe })
        .select("_id name")
        .lean<{ _id: mongoose.Types.ObjectId; name: string } | null>();
    }

    if (!charDoc) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const db = await getInventoriesDb();
    const collection = db.collection(charDoc.name.toLowerCase());
    const charId =
      typeof charDoc._id === "string" ? new mongoose.Types.ObjectId(charDoc._id) : charDoc._id;

    const rows = await collection.find({ characterId: charId }).toArray();

    const stacks: Array<{ _id: string; itemName: string; quantity: number }> = [];
    for (const row of rows) {
      const q = Number(row.quantity);
      if (!Number.isFinite(q) || q <= 0) continue;
      if (!row._id) continue;
      stacks.push({
        _id: String(row._id),
        itemName: String(row.itemName ?? ""),
        quantity: q,
      });
    }

    stacks.sort((a, b) => a.itemName.localeCompare(b.itemName));

    return NextResponse.json({ characterName: charDoc.name, stacks });
  } catch (err) {
    console.error("[api/crafting-requests/inventory-stacks]", err);
    return NextResponse.json({ error: "Failed to load inventory" }, { status: 500 });
  }
}
