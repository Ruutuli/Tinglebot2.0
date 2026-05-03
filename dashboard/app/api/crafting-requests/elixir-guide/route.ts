import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { elixirTierLabel, isMixerOutputElixirName } from "@/lib/elixir-catalog";

export const dynamic = "force-dynamic";

function normalizeCraftingMaterial(raw: unknown): Array<{ itemName: string; quantity: number }> {
  const mats = Array.isArray(raw) ? raw : [];
  const out: Array<{ itemName: string; quantity: number }> = [];
  for (const m of mats) {
    if (!m || typeof m !== "object") continue;
    const need = Number((m as { quantity?: unknown }).quantity);
    const name = String((m as { itemName?: unknown }).itemName ?? "").trim();
    if (!Number.isFinite(need) || need <= 0 || !name) continue;
    out.push({ itemName: name, quantity: Math.floor(need) });
  }
  return out;
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const craftItemName = (url.searchParams.get("craftItemName") ?? "").trim();
    const targetLevel = Math.min(3, Math.max(1, parseInt(url.searchParams.get("targetLevel") ?? "1", 10) || 1));

    if (!craftItemName) {
      return NextResponse.json({ error: "craftItemName is required" }, { status: 400 });
    }
    if (!isMixerOutputElixirName(craftItemName)) {
      return NextResponse.json(
        { error: "That item is not a mixer-output elixir — potency tiers only apply to mixer elixirs." },
        { status: 400 }
      );
    }

    await connect();
    const Item = (await import("@/models/ItemModel.js")).default;

    const outputItem = await Item.findOne({
      itemName: craftItemName,
      crafting: true,
    })
      .select("craftingMaterial")
      .lean<{ craftingMaterial?: unknown } | null>();

    if (!outputItem) {
      return NextResponse.json(
        {
          error: `No craftable catalog item named "${craftItemName}". Try re-picking the elixir from search — the name must match the database exactly.`,
        },
        { status: 404 }
      );
    }

    const craftingMaterial = normalizeCraftingMaterial(outputItem.craftingMaterial);

    return NextResponse.json({
      craftItemName,
      targetLevel,
      tierLabel: elixirTierLabel(targetLevel),
      craftingMaterial,
      recipeIncomplete: craftingMaterial.length === 0,
    });
  } catch (err) {
    console.error("[api/crafting-requests/elixir-guide]", err);
    return NextResponse.json(
      {
        error:
          "Could not load mixer recipe from the server. Wait a moment, then change potency tier or close and reopen the form to retry.",
      },
      { status: 500 }
    );
  }
}
