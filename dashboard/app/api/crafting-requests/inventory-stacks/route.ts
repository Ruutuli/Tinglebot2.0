import { NextResponse } from "next/server";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";
import { userOwnsCharacterName } from "@/lib/crafting-request-helpers";
import { effectFamilyFromElixirItemName, isMixerOutputElixirName } from "@/lib/elixir-catalog";
import {
  fetchMixerItemDocsByInventoryNames,
  loadMixerLabelSetsFromDb,
  mixerCommissionEligibleSync,
  mixerNormKey,
} from "@/lib/mixer-commission-pool";
import { normalizedInventoryItemNameForRecipeMatch } from "@/lib/elixir-material-line-match";
import { leanOne } from "@/lib/mongoose-lean";

function escapeRegex(s: string): string {
  return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

    type LeanChar = { _id: mongoose.Types.ObjectId | string; name: string };
    let charDoc = leanOne<LeanChar>(
      await Character.findOne({ userId: user.id, name: nameRe }).select("_id name").lean()
    );
    if (!charDoc) {
      charDoc = leanOne<LeanChar>(
        await ModCharacter.findOne({ userId: user.id, name: nameRe }).select("_id name").lean()
      );
    }

    if (!charDoc) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const db = await getInventoriesDb();
    const collection = db.collection(charDoc.name.toLowerCase());
    const charId =
      typeof charDoc._id === "string" ? new mongoose.Types.ObjectId(charDoc._id) : charDoc._id;

    const rows = await collection.find({ characterId: charId }).toArray();

    let stacks: Array<{ _id: string; itemName: string; quantity: number }> = [];
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

    const mixerCraftItemName = (url.searchParams.get("mixerCraftItemName") ?? "").trim();
    if (mixerCraftItemName) {
      if (!isMixerOutputElixirName(mixerCraftItemName)) {
        return NextResponse.json(
          { error: "mixerCraftItemName must be a mixer workshop elixir (e.g. Chilly Elixir)." },
          { status: 400 }
        );
      }
      const Item = (await import("@/models/ItemModel.js")).default;
      const canonical = normalizedInventoryItemNameForRecipeMatch(mixerCraftItemName);
      const craftDoc = await Item.findOne({
        itemName: new RegExp(`^${escapeRegex(canonical)}$`, "i"),
      })
        .select("craftingMaterial itemName")
        .lean<{ craftingMaterial?: unknown; itemName?: string } | null>();

      const mats = Array.isArray(craftDoc?.craftingMaterial)
        ? (craftDoc!.craftingMaterial as Array<{ itemName: string; quantity: number }>)
        : [];
      const brewFam = effectFamilyFromElixirItemName(mixerCraftItemName);
      if (!brewFam || mats.length === 0) {
        return NextResponse.json(
          { error: "Could not load recipe materials for that elixir. Try another item or contact staff." },
          { status: 400 }
        );
      }

      const sets = await loadMixerLabelSetsFromDb();
      const docMap = await fetchMixerItemDocsByInventoryNames(stacks.map((s) => s.itemName));
      stacks = stacks.filter((s) =>
        mixerCommissionEligibleSync({
          inventoryItemName: s.itemName,
          craftingMaterial: mats,
          brewEffectFamily: brewFam,
          itemDoc: docMap.get(mixerNormKey(s.itemName)) ?? null,
          sets,
        })
      );
    }

    return NextResponse.json({ characterName: charDoc.name, stacks });
  } catch (err) {
    console.error("[api/crafting-requests/inventory-stacks]", err);
    return NextResponse.json({ error: "Failed to load inventory" }, { status: 500 });
  }
}
