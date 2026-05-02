import { NextResponse } from "next/server";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";
import { userOwnsCharacterName } from "@/lib/crafting-request-helpers";
import { generalCategories } from "@/lib/general-item-categories";

export const dynamic = "force-dynamic";

type CraftingMaterial = { itemName: string; quantity: number };
type InventoryItem = { itemName: string; quantity: number };

function checkMaterialAvailability(
  material: CraftingMaterial,
  inventory: InventoryItem[],
  categories: Record<string, string[]>
): { owned: number; hasEnough: boolean } {
  const requiredQty = material.quantity;
  let ownedQty = 0;

  if (categories[material.itemName]) {
    const categoryItems = categories[material.itemName];
    ownedQty = inventory
      .filter((invItem) => categoryItems.includes(invItem.itemName))
      .reduce((sum, inv) => sum + inv.quantity, 0);
  } else {
    ownedQty = inventory
      .filter((invItem) => invItem.itemName.toLowerCase() === material.itemName.toLowerCase())
      .reduce((sum, inv) => sum + inv.quantity, 0);
  }

  return {
    owned: ownedQty,
    hasEnough: ownedQty >= requiredQty,
  };
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    const user = session.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const craftItemName = (url.searchParams.get("craftItemName") ?? "").trim();
    const requesterCharacterName = (url.searchParams.get("requesterCharacterName") ?? "").trim();

    if (!craftItemName || !requesterCharacterName) {
      return NextResponse.json(
        { error: "craftItemName and requesterCharacterName are required" },
        { status: 400 }
      );
    }

    const owns = await userOwnsCharacterName(user.id, requesterCharacterName);
    if (!owns) {
      return NextResponse.json({ error: "That OC is not yours" }, { status: 403 });
    }

    await connect();
    const Item = (await import("@/models/ItemModel.js")).default;
    const Character = (await import("@/models/CharacterModel.js")).default;
    const ModCharacterModule = await import("@/models/ModCharacterModel.js");
    const ModCharacter = ModCharacterModule.default || ModCharacterModule;

    const item = await Item.findOne({
      itemName: craftItemName,
      crafting: true,
    })
      .select("itemName craftingMaterial")
      .lean();

    if (!item) {
      return NextResponse.json({ error: "Craftable item not found" }, { status: 404 });
    }

    const rawMaterials = (item as { craftingMaterial?: CraftingMaterial[] }).craftingMaterial ?? [];
    if (!Array.isArray(rawMaterials) || rawMaterials.length === 0) {
      return NextResponse.json({
        craftItemName: (item as unknown as { itemName: string }).itemName,
        hasRecipe: false,
        allMaterialsMet: false,
        lines: [] as Array<{
          itemName: string;
          quantity: number;
          ownedQty: number;
          sufficient: boolean;
        }>,
      });
    }

    const esc = requesterCharacterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

    const inventory: InventoryItem[] = [];
    for (const row of rows) {
      const q = Number(row.quantity);
      if (!Number.isFinite(q) || q <= 0) continue;
      inventory.push({ itemName: String(row.itemName ?? ""), quantity: q });
    }

    const lines: Array<{
      itemName: string;
      quantity: number;
      ownedQty: number;
      sufficient: boolean;
    }> = [];

    for (const m of rawMaterials) {
      const need = Number(m.quantity);
      if (!Number.isFinite(need) || need <= 0) continue;
      const material: CraftingMaterial = { itemName: String(m.itemName ?? ""), quantity: need };
      if (!material.itemName) continue;
      const { owned, hasEnough } = checkMaterialAvailability(
        material,
        inventory,
        generalCategories
      );
      lines.push({
        itemName: material.itemName,
        quantity: need,
        ownedQty: owned,
        sufficient: hasEnough,
      });
    }

    if (lines.length === 0) {
      return NextResponse.json({
        craftItemName: (item as unknown as { itemName: string }).itemName,
        hasRecipe: false,
        allMaterialsMet: false,
        lines: [],
      });
    }

    const allMaterialsMet = lines.every((l) => l.sufficient);

    return NextResponse.json({
      craftItemName: (item as unknown as { itemName: string }).itemName,
      hasRecipe: true,
      allMaterialsMet,
      lines,
    });
  } catch (err) {
    console.error("[api/crafting-requests/material-check]", err);
    return NextResponse.json({ error: "Material check failed" }, { status: 500 });
  }
}
