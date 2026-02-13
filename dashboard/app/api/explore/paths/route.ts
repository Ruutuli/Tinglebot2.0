import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { notifyPathDrawn } from "@/lib/pathMonitorNotify";

export const dynamic = "force-dynamic";

const MAX_PATHS_RETURNED = 300;
const MAX_BODY_BYTES = 200_000;

function sanitizePathForResponse(p: Record<string, unknown>): Record<string, unknown> {
  const coords = Array.isArray(p.coordinates) ? p.coordinates : [];
  const safeCoords = coords
    .filter((c): c is Record<string, unknown> => c != null && typeof c === "object")
    .map((c) => ({
      lat: typeof c.lat === "number" && Number.isFinite(c.lat) ? c.lat : 0,
      lng: typeof c.lng === "number" && Number.isFinite(c.lng) ? c.lng : 0,
    }));
  return {
    _id: p._id,
    partyId: p.partyId ?? null,
    squareId: p.squareId ?? null,
    quadrantId: p.quadrantId ?? null,
    coordinates: safeCoords,
    name: typeof p.name === "string" ? p.name : "",
    discordId: typeof p.discordId === "string" ? p.discordId : "",
    createdAt: p.createdAt,
  };
}

/** GET /api/explore/paths — list paths for the map. Query: partyId (optional). */
export async function GET(request: NextRequest) {
  try {
    await connect();
    const { searchParams } = new URL(request.url);
    const partyId = searchParams.get("partyId")?.trim().slice(0, 32) || null;

    const MapPath =
      mongoose.models.MapPath ??
      ((await import("@/models/MapPathModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;

    const filter: Record<string, unknown> = {};
    if (partyId) filter.partyId = partyId;

    const paths = await MapPath.find(filter)
      .sort({ createdAt: -1 })
      .limit(MAX_PATHS_RETURNED)
      .lean();
    const list = (paths as Array<Record<string, unknown>>).map(sanitizePathForResponse);

    return NextResponse.json({ paths: list });
  } catch (err) {
    console.error("[explore/paths] GET error:", err);
    return NextResponse.json({ error: "Failed to load paths" }, { status: 500 });
  }
}

/** POST /api/explore/paths — create a path. Auth required. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  const user = session?.user;
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 }
      );
    }
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const PathModelModule = await import("@/models/MapPathModel.js") as {
    default: mongoose.Model<unknown>;
    MAP_PATH_LIMITS: {
      MIN_POINTS: number;
      MAX_POINTS: number;
      LAT_MIN: number;
      LAT_MAX: number;
      LNG_MIN: number;
      LNG_MAX: number;
    };
  };
  const LIMITS = PathModelModule.MAP_PATH_LIMITS ?? {
    MIN_POINTS: 2,
    MAX_POINTS: 500,
    LAT_MIN: 0,
    LAT_MAX: 20000,
    LNG_MIN: 0,
    LNG_MAX: 24000,
  };
  const partyId = typeof body.partyId === "string" ? body.partyId.trim().slice(0, 32) || null : null;
  const rawCoords = Array.isArray(body.coordinates) ? body.coordinates : [];
  const squareId = typeof body.squareId === "string" ? body.squareId.trim().slice(0, 8) || null : null;
  const quadrantId = typeof body.quadrantId === "string" ? body.quadrantId.trim().slice(0, 4) || null : null;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";

  if (rawCoords.length < LIMITS.MIN_POINTS) {
    return NextResponse.json(
      { error: `Path must have at least ${LIMITS.MIN_POINTS} points` },
      { status: 400 }
    );
  }
  if (rawCoords.length > LIMITS.MAX_POINTS) {
    return NextResponse.json(
      { error: `Path cannot exceed ${LIMITS.MAX_POINTS} points` },
      { status: 400 }
    );
  }

  const normalized: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < rawCoords.length; i++) {
    const p = rawCoords[i] as Record<string, unknown> | null;
    if (p == null || typeof p !== "object") continue;
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const clamped = {
      lat: Math.max(LIMITS.LAT_MIN, Math.min(LIMITS.LAT_MAX, lat)),
      lng: Math.max(LIMITS.LNG_MIN, Math.min(LIMITS.LNG_MAX, lng)),
    };
    const prev = normalized[normalized.length - 1];
    if (!prev || prev.lat !== clamped.lat || prev.lng !== clamped.lng) {
      normalized.push(clamped);
    }
  }

  if (normalized.length < LIMITS.MIN_POINTS) {
    return NextResponse.json(
      { error: "Path must have at least 2 distinct points" },
      { status: 400 }
    );
  }

  try {
    await connect();
    const User = (await import("@/models/UserModel.js")).default;
    const userDoc = await User.findOne({ discordId: user.id }).select("_id").lean();
    const createdBy = userDoc ? (userDoc as { _id: unknown })._id : null;

    const MapPath = mongoose.models.MapPath ?? PathModelModule.default;

    const doc = new MapPath({
      partyId: partyId || undefined,
      squareId: squareId || undefined,
      quadrantId: quadrantId || undefined,
      coordinates: normalized,
      name: name || (partyId && squareId && quadrantId ? `Secured path ${squareId} ${quadrantId}` : "Path"),
      createdBy: createdBy || undefined,
      discordId: user.id,
    });
    await doc.save();

    const userLabel =
      (user as { global_name?: string | null }).global_name?.trim() ||
      user.username?.trim() ||
      user.id ||
      "unknown";
    notifyPathDrawn({
      partyId: partyId || "—",
      userLabel,
      kind: "drawn",
    });

    const saved = doc.toObject() as Record<string, unknown>;
    return NextResponse.json({
      success: true,
      path: sanitizePathForResponse(saved),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save path";
    console.error("[explore/paths] POST error:", err);
    if (err instanceof mongoose.Error.ValidationError) {
      const first = Object.values(err.errors)[0];
      const reason = first && typeof first === "object" && "message" in first ? String(first.message) : msg;
      return NextResponse.json({ error: reason }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to save path" }, { status: 500 });
  }
}
