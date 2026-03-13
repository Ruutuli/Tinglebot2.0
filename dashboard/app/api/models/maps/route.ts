// ============================================================================
// GET /api/models/maps - List map squares with pagination, search, and filters
// ============================================================================

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import {
  parsePaginatedQuery,
  getFilterParamMultiple,
  buildListResponse,
  buildSearchRegex,
} from "@/lib/api-utils";
import { logger } from "@/utils/logger";

function buildCaseInsensitiveFilter(field: string, values: string[]): { $or: Array<Record<string, RegExp>> } {
  const conditions = values.map((value) => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return { [field]: new RegExp(`^${escaped}$`, "i") };
  });
  return { $or: conditions };
}

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET(req: NextRequest) {
  try {
    await connect();
    const Square = (await import("@/models/mapModel.js")).default;

    const { page, limit, search } = parsePaginatedQuery(req);
    const params = req.nextUrl.searchParams;
    const regions = getFilterParamMultiple(params, "region");
    const statuses = getFilterParamMultiple(params, "status");
    const quadrantStatuses = getFilterParamMultiple(params, "quadrantStatus");
    const hazards = getFilterParamMultiple(params, "hazard");
    const terrains = getFilterParamMultiple(params, "terrain");
    const blightedParam = params.get("blighted");
    const hasDiscoveriesParam = params.get("hasDiscoveries");
    const hideAllInaccessibleParam = params.get("hideAllInaccessible");
    const sortBy = params.get("sortBy") || "name";

    const filter: Record<string, unknown> = {};

    const re = buildSearchRegex(search);
    if (re) {
      filter.$or = [{ squareId: re }, { region: re }];
    }

    const pushCondition = (cond: Record<string, unknown>) => {
      if (filter.$or) {
        filter.$and = filter.$and ?? [];
        (filter.$and as unknown[]).push({ $or: filter.$or }, cond);
        delete filter.$or;
      } else if (filter.$and) {
        (filter.$and as unknown[]).push(cond);
      } else {
        Object.assign(filter, cond);
      }
    };

    if (regions.length) {
      const regionFilter = buildCaseInsensitiveFilter("region", regions);
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, regionFilter];
        delete filter.$or;
      } else {
        filter.$or = regionFilter.$or;
      }
    }

    if (statuses.length) {
      const statusFilter = buildCaseInsensitiveFilter("status", statuses);
      pushCondition(statusFilter);
    }

    if (quadrantStatuses.length) {
      const normalized = quadrantStatuses.map((s) => String(s).toLowerCase());
      pushCondition({ "quadrants.status": { $in: normalized } });
    }

    if (blightedParam === "true") {
      pushCondition({ "quadrants.blighted": true });
    }

    if (hasDiscoveriesParam === "true") {
      pushCondition({ "quadrants.discoveries.0": { $exists: true } });
    }

    if (hideAllInaccessibleParam === "true") {
      pushCondition({
        $nor: [
          {
            $and: [
              { quadrants: { $size: 4 } },
              { "quadrants.status": { $all: ["inaccessible", "inaccessible", "inaccessible", "inaccessible"] } },
            ],
          },
        ],
      });
    }

    if (hazards.length) {
      pushCondition({ "quadrants.hazards": { $in: hazards } });
    }

    if (terrains.length) {
      pushCondition({ "quadrants.terrain": { $in: terrains } });
    }

    let sortQuery: Record<string, 1 | -1> = { squareId: 1 };
    if (sortBy === "name-desc") {
      sortQuery = { squareId: -1 };
    } else if (sortBy === "region") {
      sortQuery = { region: 1, squareId: 1 };
    } else if (sortBy === "region-desc") {
      sortQuery = { region: -1, squareId: 1 };
    }

    const [data, total, regionOpts, statusOpts, quadrantStatusOpts, hazardOpts, terrainOpts] = await Promise.all([
      Square.find(filter)
        .select(
          "squareId region status quadrants image pathImageUrl displayProperties mapCoordinates createdAt updatedAt"
        )
        .sort(sortQuery)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Square.countDocuments(filter),
      Square.distinct("region"),
      Square.distinct("status"),
      Square.distinct("quadrants.status"),
      Square.distinct("quadrants.hazards"),
      Square.distinct("quadrants.terrain"),
    ]);

    const filterOptions: Record<string, (string | number)[]> = {
      region: (regionOpts as string[]).filter(Boolean).sort(),
      status: (statusOpts as string[]).filter(Boolean).sort(),
      quadrantStatus: (quadrantStatusOpts as string[]).filter(Boolean).sort(),
      hazard: (hazardOpts as string[]).filter(Boolean).sort(),
      terrain: (terrainOpts as string[]).filter(Boolean).sort(),
      blighted: ["true", "false"],
      hasDiscoveries: ["true", "false"],
      hideAllInaccessible: ["true", "false"],
    };

    const response = NextResponse.json(
      buildListResponse({
        data: data as unknown[],
        total,
        page,
        limit,
        filterOptions,
      })
    );

    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=3600"
    );

    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const code = e && typeof e === "object" && "code" in e ? (e as { code: string }).code : "";
    const isConnectionError =
      message.includes("ETIMEDOUT") ||
      message.includes("ECONNRESET") ||
      message.includes("connection") ||
      code === "ETIMEDOUT" ||
      code === "ECONNRESET";
    logger.error("api/models/maps", message);
    return NextResponse.json(
      { error: isConnectionError ? "Database temporarily unavailable. Please try again." : "Failed to fetch map squares" },
      { status: isConnectionError ? 503 : 500 }
    );
  }
}
