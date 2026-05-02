import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  describeMixerPartRequirement,
  effectFamilyFromElixirItemName,
  elixirTierLabel,
  getAllowedPartElementsForFamily,
  isMixerOutputElixirName,
  mixerRarityGuidanceForTier,
} from "@/lib/elixir-catalog";

export const dynamic = "force-dynamic";

const EXCLUDED = new Set(["chuchu egg"]);

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const craftItemName = (url.searchParams.get("craftItemName") ?? "").trim();
    const targetLevel = Math.min(3, Math.max(1, parseInt(url.searchParams.get("targetLevel") ?? "1", 10) || 1));

    if (!craftItemName || !isMixerOutputElixirName(craftItemName)) {
      return NextResponse.json({ error: "Not a mixer elixir item" }, { status: 400 });
    }

    const effectFamily = effectFamilyFromElixirItemName(craftItemName);
    if (!effectFamily) {
      return NextResponse.json({ error: "Unknown elixir family" }, { status: 400 });
    }

    await connect();
    const Item = (await import("@/models/ItemModel.js")).default;

    const allowedElements = getAllowedPartElementsForFamily(effectFamily);

    /** Hard cap so one brew line cannot return an unbounded payload if the DB grows oddly. */
    const LIST_CAP = 500;

    const [critterDocs, partDocs] = await Promise.all([
      Item.find({
        effectFamily,
        itemName: { $exists: true, $ne: "" },
      })
        .select("itemName")
        .sort({ itemName: 1 })
        .limit(LIST_CAP)
        .lean(),
      Item.find({
        $or: [{ effectFamily: { $exists: false } }, { effectFamily: null }, { effectFamily: "" }],
        element: { $in: allowedElements },
        itemName: { $exists: true, $ne: "" },
      })
        .select("itemName")
        .sort({ itemName: 1 })
        .limit(LIST_CAP)
        .lean(),
    ]);

    const eligibleCritters = critterDocs
      .map((d) => String((d as { itemName?: string }).itemName ?? "").trim())
      .filter((n) => n && !EXCLUDED.has(n.toLowerCase()));

    const eligibleParts = partDocs
      .map((d) => String((d as { itemName?: string }).itemName ?? "").trim())
      .filter((n) => n && !EXCLUDED.has(n.toLowerCase()));

    return NextResponse.json({
      craftItemName,
      effectFamily,
      targetLevel,
      tierLabel: elixirTierLabel(targetLevel),
      partRequirement: describeMixerPartRequirement(effectFamily),
      rarityGuidance: mixerRarityGuidanceForTier(targetLevel),
      eligibleCritters,
      eligibleParts,
      eligibleCrittersCapped: critterDocs.length >= LIST_CAP,
      eligiblePartsCapped: partDocs.length >= LIST_CAP,
      slots: [
        {
          role: "Critter",
          detail: `1× mixer critter with this brew’s effect (same family as ${craftItemName}).`,
        },
        {
          role: "Monster part",
          detail: `1× ${describeMixerPartRequirement(effectFamily)}.`,
        },
        {
          role: "Extras (optional)",
          detail:
            "More labeled critters (same family), matching thread-element parts, or Fairy / Mock Fairy — changes potency and small bonuses (see bot mixer rules).",
        },
      ],
    });
  } catch (err) {
    console.error("[api/crafting-requests/elixir-guide]", err);
    return NextResponse.json({ error: "Failed to build elixir guide" }, { status: 500 });
  }
}
