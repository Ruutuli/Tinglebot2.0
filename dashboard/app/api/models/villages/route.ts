import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import {
  parsePaginatedQuery,
  getFilterParamMultiple,
  buildListResponse,
  buildSearchRegex,
} from "@/lib/api-utils";
import { logger } from "@/utils/logger";

// ------------------- Map Serialization -------------------
function serializeMap(m: Map<unknown, unknown> | Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (m instanceof Map) return Object.fromEntries(m);
  return (m ?? {}) as Record<string, unknown>;
}

// ------------------- Case-Insensitive Filter -------------------
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

export async function GET(req: NextRequest) {
  try {
    await connect();
    const { Village, VILLAGE_CONFIG } = await import("@/models/VillageModel.js");
    let Character: { find: (q: object) => { select: (s: string) => { lean: () => Promise<{ _id: unknown; name: string }[]> } } };
    let ModCharacter: { find: (q: object) => { select: (s: string) => { lean: () => Promise<{ _id: unknown; name: string }[]> } } };
    try {
      const CharMod = await import("@/models/CharacterModel.js");
      const ModCharMod = await import("@/models/ModCharacterModel.js");
      Character = CharMod.default || CharMod;
      ModCharacter = ModCharMod.default || ModCharMod;
    } catch {
      const noop = async () => Promise.resolve([]);
      Character = { find: () => ({ select: () => ({ lean: noop }) }) };
      ModCharacter = { find: () => ({ select: () => ({ lean: noop }) }) };
    }

    const { page, limit, search } = parsePaginatedQuery(req);
    const params = req.nextUrl.searchParams;
    const regions = getFilterParamMultiple(params, "region");

    const filter: Record<string, unknown> = {};

    const re = buildSearchRegex(search);
    if (re) {
      filter.$or = [{ name: re }, { region: re }];
    }
    // Region filter (case-insensitive)
    if (regions.length) {
      const regionFilter = buildCaseInsensitiveFilter("region", regions);
      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          regionFilter
        ];
        delete filter.$or;
      } else {
        filter.$or = regionFilter.$or;
      }
    }

    const [rawData, total, regionOpts] = await Promise.all([
      Village.find(filter).skip((page - 1) * limit).limit(limit).lean(),
      Village.countDocuments(filter),
      Village.distinct("region"),
    ]);

    // ------------------- Collect All Contributor IDs -------------------
    const allContributorIds = new Set<string>();
    for (const v of rawData as Record<string, unknown>[]) {
      const contribs = serializeMap(v.contributors as Map<unknown, unknown> | Record<string, unknown>);
      for (const id of Object.keys(contribs)) {
        if (id && !id.startsWith("$") && mongoose.Types.ObjectId.isValid(id)) {
          allContributorIds.add(id);
        }
      }
    }

    // ------------------- Resolve Character Names -------------------
    const idToName: Record<string, string> = {};
    if (allContributorIds.size > 0) {
      const ids = Array.from(allContributorIds).map(id => new mongoose.Types.ObjectId(id));
      const [regularChars, modChars] = await Promise.all([
        Character.find({ _id: { $in: ids } }).select("name").lean(),
        ModCharacter.find({ _id: { $in: ids } }).select("name").lean(),
      ]);
      for (const c of [...regularChars, ...modChars]) {
        const id = (c._id as mongoose.Types.ObjectId).toString();
        idToName[id] = c.name ?? `Character ${id.slice(-6)}`;
      }
    }

    // ------------------- Process Each Village -------------------
    const data = (rawData as Record<string, unknown>[]).map((v) => {
      const materials = serializeMap(v.materials) as Record<string, { current?: number; required?: Record<string, number> }>;
      const contributors = serializeMap(v.contributors) as Record<string, { items?: Record<string, number>; tokens?: number }>;
      const tokenReqs = serializeMap(v.tokenRequirements) as Record<string, number>;
      const levelHealth = serializeMap(v.levelHealth) as Record<string, number>;
      const cooldowns = serializeMap(v.cooldowns);

      const level = (v.level as number) ?? 1;
      const nextLevel = level + 1;
      const config = VILLAGE_CONFIG[v.name as keyof typeof VILLAGE_CONFIG];
      const configMaterials = config?.materials ?? {};

      // materialsProgress: { material, donated, required, remaining } for next level
      const materialsProgress: { material: string; donated: number; required: number; remaining: number }[] = [];
      if (level < 3 && config) {
        for (const [matName, matConfig] of Object.entries(configMaterials)) {
          const required = (matConfig as { required?: Record<string, number> })?.required?.[nextLevel] ?? 0;
          if (required <= 0) continue;
          const matchedKey = Object.keys(materials).find(k => k.toLowerCase() === matName.toLowerCase()) ?? matName;
          const donated = materials[matchedKey]?.current ?? 0;
          materialsProgress.push({
            material: matName,
            donated,
            required,
            remaining: Math.max(0, required - donated),
          });
        }
        materialsProgress.sort((a, b) => b.required - a.required);
      }

      // tokenProgress for next level
      const tokenRequired = tokenReqs[nextLevel.toString()] ?? tokenReqs[String(nextLevel)] ?? 0;
      const tokenCurrent = (v.currentTokens as number) ?? 0;
      const tokenProgress = level < 3
        ? { current: tokenCurrent, required: tokenRequired, remaining: Math.max(0, tokenRequired - tokenCurrent) }
        : { current: 0, required: 0, remaining: 0 };

      // Enrich contributors with names
      const contributorsEnriched = Object.entries(contributors).map(([charId, data]) => ({
        characterId: charId,
        characterName: idToName[charId] ?? `Character ${charId.slice(-6)}`,
        items: data?.items ?? {},
        tokens: data?.tokens ?? 0,
        totalItems: Object.values(data?.items ?? {}).reduce((s, n) => s + n, 0),
      })).sort((a, b) => (b.tokens + b.totalItems) - (a.tokens + a.totalItems));

      return {
        ...v,
        materials,
        contributors: contributorsEnriched,
        tokenRequirements: tokenReqs,
        levelHealth,
        cooldowns,
        materialsProgress,
        tokenProgress,
      };
    });

    const filterOptions: Record<string, (string | number)[]> = {
      region: (regionOpts as string[]).filter(Boolean).sort(),
    };

    const response = NextResponse.json(
      buildListResponse({
        data,
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
    logger.error("api/models/villages", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch villages" },
      { status: 500 }
    );
  }
}
