import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { connect } from "@/lib/db";
import { evaluateRecipeMaterialsOnInventory } from "@/lib/craft-recipe-material-check";

export const dynamic = "force-dynamic";

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

    await connect();
    const Item = (await import("@/models/ItemModel.js")).default;
    const item = await Item.findOne({
      itemName: craftItemName,
      crafting: true,
    })
      .select("itemName craftingMaterial")
      .lean();

    if (!item) {
      return NextResponse.json({ error: "Craftable item not found" }, { status: 404 });
    }

    const itemDoc = item as unknown as { itemName?: string; craftingMaterial?: unknown };
    const resolvedCraftItemName = String(itemDoc.itemName ?? craftItemName).trim();
    const rawMaterials = itemDoc.craftingMaterial ?? [];
    const evalResult = await evaluateRecipeMaterialsOnInventory(
      user.id,
      requesterCharacterName,
      rawMaterials
    );

    if (!evalResult.ok) {
      const status = evalResult.error.includes("not yours") ? 403 : 404;
      return NextResponse.json({ error: evalResult.error }, { status });
    }

    if (!evalResult.hasRecipe) {
      return NextResponse.json({
        craftItemName: resolvedCraftItemName,
        hasRecipe: false,
        allMaterialsMet: false,
        lines: [],
      });
    }

    return NextResponse.json({
      craftItemName: resolvedCraftItemName,
      hasRecipe: true,
      allMaterialsMet: evalResult.allMaterialsMet,
      lines: evalResult.lines,
    });
  } catch (err) {
    console.error("[api/crafting-requests/material-check]", err);
    return NextResponse.json({ error: "Material check failed" }, { status: 500 });
  }
}
