// ============================================================================
// GET /api/crafting/by-ingredients
// Catalog recipes whose craftingMaterial includes given ingredient(s).
// Query: ingredients=comma,separated OR repeated ingredient= ; match=any|all (default all)
// ============================================================================

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { escapeRegExp } from "@/lib/api-utils";
import { expandIngredientToMaterialSlotNames } from "@/lib/crafting-ingredient-expand";
import { getCraftingJobs } from "@/lib/crafting-jobs";
import { logger } from "@/utils/logger";

type CraftingMaterial = {
  itemName: string;
  quantity: number;
  emoji?: string;
};

type RecipeResult = {
  itemName: string;
  emoji?: string;
  category?: string | string[];
  staminaToCraft?: number;
  allJobs?: string[];
  craftingMaterial: CraftingMaterial[];
  image?: string;
};

type ItemDocument = {
  itemName?: string;
  emoji?: string;
  category?: string | string[];
  staminaToCraft?: number;
  allJobs?: string[];
  craftingMaterial?: CraftingMaterial[];
  cook?: boolean;
  blacksmith?: boolean;
  craftsman?: boolean;
  maskMaker?: boolean;
  researcher?: boolean;
  weaver?: boolean;
  artist?: boolean;
  witch?: boolean;
  image?: string;
};

function normalizeError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function parseIngredients(params: URLSearchParams): string[] {
  const fromList = params.getAll("ingredient").map((s) => s.trim()).filter(Boolean);
  const csv = params.get("ingredients");
  const fromCsv = csv
    ? csv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const combined = [...fromCsv, ...fromList];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of combined) {
    const key = raw.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(raw);
    }
  }
  return unique;
}

function conditionForIngredient(ingredient: string): Record<string, unknown> {
  const slots = expandIngredientToMaterialSlotNames(ingredient);
  const regexes = slots.map((s) => new RegExp(`^${escapeRegExp(s)}$`, "i"));
  return {
    craftingMaterial: {
      $elemMatch: {
        itemName: { $in: regexes },
      },
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const ingredients = parseIngredients(params);
    if (ingredients.length === 0) {
      return NextResponse.json(
        { error: "Provide at least one ingredient (ingredients= or ingredient=)." },
        { status: 400 }
      );
    }

    const matchRaw = (params.get("match") || "all").toLowerCase();
    const matchMode = matchRaw === "all" ? "all" : "any";

    await connect();

    let Item: mongoose.Model<unknown>;
    if (mongoose.models.Item) {
      Item = mongoose.models.Item;
    } else {
      const { default: ItemModel } = await import("@/models/ItemModel.js");
      Item = ItemModel as unknown as mongoose.Model<unknown>;
    }

    const ingredientConds = ingredients.map(conditionForIngredient);

    // Keep every predicate inside one top-level $and so `craftingMaterial` is not mixed
    // at the root with $elemMatch clauses (avoids driver/merge quirks on the same field).
    const filter: Record<string, unknown> = {
      $and: [
        { crafting: true },
        { craftingMaterial: { $exists: true, $ne: [] } },
        ...(matchMode === "all"
          ? ingredientConds
          : [{ $or: ingredientConds }]),
      ],
    };

    const docs = (await Item.find(filter)
      .select(
        "itemName emoji category staminaToCraft allJobs craftingMaterial cook blacksmith craftsman maskMaker researcher weaver artist witch image"
      )
      .lean()) as ItemDocument[];

    const results: RecipeResult[] = docs.map((item) => ({
      itemName: String(item.itemName || ""),
      emoji: item.emoji ? String(item.emoji) : undefined,
      category: item.category,
      staminaToCraft: item.staminaToCraft,
      allJobs: getCraftingJobs(item),
      craftingMaterial: (item.craftingMaterial || []) as CraftingMaterial[],
      image: item.image ? String(item.image) : undefined,
    }));

    results.sort((a, b) => {
      const categoryA = Array.isArray(a.category) ? a.category[0] : a.category || "";
      const categoryB = Array.isArray(b.category) ? b.category[0] : b.category || "";
      if (categoryA !== categoryB) {
        return categoryA.localeCompare(categoryB);
      }
      return a.itemName.localeCompare(b.itemName);
    });

    const response = NextResponse.json({
      data: results,
      match: matchMode,
      ingredients,
    });
    response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return response;
  } catch (err) {
    const error = normalizeError(err);
    logger.error("[crafting/by-ingredients/route.ts] Failed:", error.message);
    return NextResponse.json(
      {
        error: "Failed to search recipes by ingredients",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
