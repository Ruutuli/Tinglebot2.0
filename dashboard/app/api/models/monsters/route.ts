import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import type { FilterQuery } from "mongoose";
import { connect } from "@/lib/db";
import {
  parsePaginatedQuery,
  getFilterParamMultiple,
  getFilterParamNumeric,
  buildListResponse,
  buildSearchRegex,
} from "@/lib/api-utils";
import { logger } from "@/utils/logger";

// Helper function to create case-insensitive filter conditions for string arrays
function buildCaseInsensitiveFilter(field: string, values: string[]): { $or: Array<Record<string, RegExp>> } {
  const conditions = values.map(value => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return { [field]: new RegExp(`^${escaped}$`, "i") };
  });
  return { $or: conditions };
}

// Uses query params (`nextUrl.searchParams`); must be dynamically rendered per-request.
// Caching is handled via `Cache-Control` response headers below.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET(req: NextRequest) {
  try {
    await connect();
    const MonsterModule = await import("@/models/MonsterModel.js");
    const Monster = (mongoose.models.Monster ?? MonsterModule.default) as mongoose.Model<unknown>;
    const monsterMapping = MonsterModule.monsterMapping as Record<string, { name?: string; image?: string }> | undefined;

    const { page, limit, search } = parsePaginatedQuery(req);
    const params = req.nextUrl.searchParams;
    const species = getFilterParamMultiple(params, "species");
    const types = getFilterParamMultiple(params, "type");
    const elements = getFilterParamMultiple(params, "element");
    const tiers = getFilterParamNumeric(params, "tier");

    const filter: FilterQuery<unknown> = {};

    const re = buildSearchRegex(search);
    if (re) {
      filter.$or = [
        { name: re },
        { nameMapping: re },
        { species: re },
        { type: re },
      ];
    }
    // Case-insensitive filtering for string-based filters
    if (species.length) {
      const speciesFilter = buildCaseInsensitiveFilter("species", species);
      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          speciesFilter
        ];
        delete filter.$or;
      } else {
        filter.$or = speciesFilter.$or;
      }
    }
    if (types.length) {
      const typeFilter = buildCaseInsensitiveFilter("type", types);
      if (filter.$or || filter.$and) {
        if (!filter.$and) filter.$and = [];
        filter.$and.push(typeFilter);
      } else {
        filter.$or = typeFilter.$or;
      }
    }
    if (elements.length) {
      const elementFilter = buildCaseInsensitiveFilter("element", elements);
      if (filter.$or || filter.$and) {
        if (!filter.$and) filter.$and = [];
        filter.$and.push(elementFilter);
      } else {
        filter.$or = elementFilter.$or;
      }
    }
    if (tiers.length) filter.tier = { $in: tiers };

    const sortBy = params.get("sortBy") || "name";
    let sortQuery: Record<string, 1 | -1> = { name: 1 };
    if (sortBy === "name-desc") sortQuery = { name: -1 };
    else if (sortBy === "tier-asc") sortQuery = { tier: 1, name: 1 };
    else if (sortBy === "tier-desc") sortQuery = { tier: -1, name: 1 };
    else if (sortBy === "species") sortQuery = { species: 1, name: 1 };
    else if (sortBy === "species-desc") sortQuery = { species: -1, name: 1 };
    else if (sortBy === "hearts-asc") sortQuery = { hearts: 1, name: 1 };
    else if (sortBy === "hearts-desc") sortQuery = { hearts: -1, name: 1 };
    else if (sortBy === "dmg-asc") sortQuery = { dmg: 1, name: 1 };
    else if (sortBy === "dmg-desc") sortQuery = { dmg: -1, name: 1 };

    const ELEMENT_ORDER = ["none", "fire", "ice", "electric", "water", "earth", "undead", "wind"];
    function sortMonsterElementOptions(opts: string[]): string[] {
      return [...opts].filter(Boolean).sort((a, b) => {
        const la = String(a).toLowerCase();
        const lb = String(b).toLowerCase();
        const ia = ELEMENT_ORDER.indexOf(la);
        const ib = ELEMENT_ORDER.indexOf(lb);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return la.localeCompare(lb);
      });
    }

    const [data, total, speciesOpts, typeOpts, elementOpts, tierOpts] = await Promise.all([
      Monster.find(filter).sort(sortQuery).skip((page - 1) * limit).limit(limit).lean(),
      Monster.countDocuments(filter),
      Monster.distinct("species"),
      Monster.distinct("type"),
      Monster.distinct("element"),
      Monster.distinct("tier"),
    ]);

    const elementFilterList = sortMonsterElementOptions(elementOpts as string[]);
    const filterOptions: Record<string, (string | number)[]> = {
      species: (speciesOpts as string[]).filter(Boolean).sort(),
      type: (typeOpts as string[]).filter(Boolean).sort(),
      ...(elementFilterList.length ? { element: elementFilterList } : {}),
      tier: (tierOpts as number[]).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b),
    };

    // Region boolean → display label (single string so "Central Hyrule" doesn't split)
    const REGION_LABELS: { field: string; label: string }[] = [
      { field: "centralHyrule", label: "Central Hyrule" },
      { field: "eldin", label: "Eldin" },
      { field: "faron", label: "Faron" },
      { field: "gerudo", label: "Gerudo" },
      { field: "hebra", label: "Hebra" },
      { field: "lanayru", label: "Lanayru" },
      { field: "pathOfScarletLeaves", label: "Path of Scarlet Leaves" },
      { field: "leafDewWay", label: "Leaf Dew Way" },
    ];

    // Merge split location strings from DB (e.g. ["Central", "Hyrule"] → ["Central Hyrule"])
    const MULTI_WORD_LOCATIONS = ["Central Hyrule", "Path of Scarlet Leaves", "Leaf Dew Way"];
    function normalizeLocations(arr: string[]): string[] {
      if (!Array.isArray(arr) || arr.length === 0) return arr;
      const joined = arr.map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
      const out: string[] = [];
      for (const phrase of MULTI_WORD_LOCATIONS) {
        if (joined.toLowerCase().includes(phrase.toLowerCase())) {
          out.push(phrase);
        }
      }
      for (const single of ["Eldin", "Lanayru", "Faron", "Gerudo", "Hebra"]) {
        if (arr.some((s) => (s ?? "").trim().toLowerCase() === single.toLowerCase())) out.push(single);
      }
      return out.length > 0 ? out : joined ? [joined] : arr;
    }

    // Resolve image and build locations from region flags (so "Central Hyrule" is one string)
    const dataWithImages = (data as Array<{ nameMapping?: string; image?: string; locations?: string[]; [k: string]: unknown }>).map((doc) => {
      const hasNoImage = !doc.image || doc.image === "No Image";
      const key = doc.nameMapping?.replace(/\s+/g, "");
      const mappedImage = key != null ? monsterMapping?.[key]?.image : undefined;
      const locationsFromFlags = REGION_LABELS.filter(({ field }) => doc[field] === true).map((r) => r.label);
      const rawLocations = doc.locations ?? [];
      const locations =
        locationsFromFlags.length > 0 ? locationsFromFlags : normalizeLocations(rawLocations as string[]);
      return { ...doc, image: hasNoImage && mappedImage ? mappedImage : doc.image, locations };
    });

    const response = NextResponse.json(
      buildListResponse({
        data: dataWithImages,
        total,
        page,
        limit,
        filterOptions,
      })
    );

    // Add cache headers for browser/CDN caching
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=3600"
    );

    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error("api/models/monsters", message);
    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      { error: isDev ? message : "Failed to fetch monsters", details: isDev ? message : undefined },
      { status: 500 }
    );
  }
}
