import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { SQUARE_W, SQUARE_H } from "@/lib/explorePathImageConstants";

export const dynamic = "force-dynamic";

const GRID_COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const GCS_IMAGES_PATH = "maps/squares/";

/** Parse square ID (e.g. H6) - validate format */
function parseSquareId(squareId: string): boolean {
  const m = String(squareId).trim().match(/^([A-J])(1[0-2]|[1-9])$/);
  if (!m) return false;
  const colIndex = GRID_COLS.indexOf(m[1]);
  const row = parseInt(m[2], 10);
  return colIndex >= 0 && row >= 1 && row <= 12;
}

/** Build image URL for a layer tile (same as map UI – relative path works for same-origin) */
function getLayerImageUrl(squareId: string, layerName: string): string {
  const filename = `${layerName}_${squareId}.png`;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const prefix = basePath ? basePath.replace(/\/$/, "") : "";
  return `${prefix}/api/images/${GCS_IMAGES_PATH}${layerName}/${filename}`;
}

/** Squares that have blight layer */
const BLIGHT_SQUARES = [
  "A10", "A11", "A12", "A8", "A9",
  "B10", "B11", "B12", "B6", "B7", "B8", "B9",
  "C10", "C11", "C12", "C4", "C5", "C6", "C7", "C8", "C9",
  "D10", "D11", "D12", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9",
  "E1", "E10", "E11", "E12", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9",
  "F1", "F10", "F11", "F12", "F2", "F3", "F5", "F6", "F7", "F8", "F9",
  "G1", "G11", "G12", "G2", "G3", "G6", "G7", "G8", "G9",
  "H1", "H10", "H11", "H2", "H3", "H6", "H7", "H8", "H9",
  "I1", "I10", "I11", "I12", "I2", "I3", "I4", "I5", "I9",
  "J1", "J10", "J2", "J3", "J4", "J5", "J9",
];

/** Path layers per square */
const PSL_SQUARES = ["G6", "H5", "H6", "H7", "H8"];
const LDW_SQUARES = ["F10", "F11", "F9", "G10", "G11", "G8", "G9", "H10", "H11", "H8", "H9"];
const OTHER_PATHS_SQUARES = ["H4", "H5", "H7", "H8", "I8"];

/** Village circle layers - only certain squares have these assets (matching map-loader.js logic) */
const INARIKO_CIRCLE_SQUARES = ["G8", "H8"];
const VHINTL_CIRCLE_SQUARES = ["F9", "F10"];
const RUDANIA_CIRCLE_SQUARES = ["H5"];

function getVillageCircleLayersForSquare(squareId: string): string[] {
  const layers: string[] = [];
  if (INARIKO_CIRCLE_SQUARES.includes(squareId)) {
    layers.push("MAP_0002s_0000s_0000_CIRCLE-INARIKO-CYAN", "MAP_0002s_0000s_0001_CIRCLE-INARIKO-PINK");
  }
  if (VHINTL_CIRCLE_SQUARES.includes(squareId)) {
    layers.push("MAP_0002s_0001s_0000_CIRCLE-VHINTL-CYAN", "MAP_0002s_0001s_0001_CIRCLE-VHINTL-PINK");
  }
  if (RUDANIA_CIRCLE_SQUARES.includes(squareId)) {
    layers.push("MAP_0002s_0002s_0000_CIRCLE-RUDANIA-CYAN", "MAP_0002s_0002s_0001_CIRCLE-RUDANIA-PINK");
  }
  return layers;
}

/** Quadrant status from DB; used to skip hidden/fog for explored/secured quads */
type QuadrantStatus = "inaccessible" | "unexplored" | "explored" | "secured";

/**
 * Build ordered layer list for a square.
 * Fog: quadrants that are unexplored or inaccessible, EXCEPT the party's current quadrant.
 * The quadrant the party has moved into is "revealed" (no fog) even though it stays unexplored until they get the "Quadrant Explored!" prompt.
 */
/** Squares that contain village start points - circles should always be visible */
const VILLAGE_SQUARES = [...INARIKO_CIRCLE_SQUARES, ...VHINTL_CIRCLE_SQUARES, ...RUDANIA_CIRCLE_SQUARES];

function getLayersForSquare(
  squareId: string,
  options?: { quadrantStatuses?: Record<string, QuadrantStatus>; revealedQuadrant?: string }
): string[] {
  const layers: string[] = [];

  // 1. Mask/fog — unexplored/inaccessible quads only; exclude party's current quadrant (revealed when they move there)
  // Skip fog entirely on village squares so safe perimeter circles are always visible
  const isVillageSquare = VILLAGE_SQUARES.includes(squareId);
  const statuses = options?.quadrantStatuses ?? {};
  const revealed = options?.revealedQuadrant ? String(options.revealedQuadrant).trim().toUpperCase() : null;
  const fogQuadrants = (["Q1", "Q2", "Q3", "Q4"] as const).filter((q) => {
    const status = statuses[q] ?? "unexplored";
    const isUnexploredOrInaccessible = status === "unexplored" || status === "inaccessible";
    const isCurrentQuadrant = revealed && q === revealed;
    return isUnexploredOrInaccessible && !isCurrentQuadrant;
  });
  if (fogQuadrants.length > 0 && !isVillageSquare) {
    layers.push("MAP_0001_hidden-areas");
  }

  // 2. Blight (if square has blight)
  if (BLIGHT_SQUARES.includes(squareId)) {
    layers.push("MAP_0000_BLIGHT");
  }

  // 3. Base
  layers.push("MAP_0002_Map-Base");

  // 4. Region borders
  layers.push("MAP_0001s_0003_Region-Borders");

  // 5. Path layers (square-specific) - before circles so circles render on top
  if (PSL_SQUARES.includes(squareId)) layers.push("MAP_0003s_0000_PSL");
  if (LDW_SQUARES.includes(squareId)) layers.push("MAP_0003s_0001_LDW");
  if (OTHER_PATHS_SQUARES.includes(squareId)) layers.push("MAP_0003s_0002_Other-Paths");

  // 6. Village circles (only for squares that have those assets) - LAST so they render on top of everything
  layers.push(...getVillageCircleLayersForSquare(squareId));

  // Region names layer omitted so they don't cover map content

  return layers;
}

/** Get quadrant bounds within a square (1–4) for overlay highlight */
function getQuadrantBounds(quadrant: number): { x: number; y: number; w: number; h: number } | null {
  if (quadrant < 1 || quadrant > 4) return null;
  const halfW = 0.5;
  const halfH = 0.5;
  const isRight = quadrant === 2 || quadrant === 4;
  const isBottom = quadrant === 3 || quadrant === 4;
  return {
    x: isRight ? 50 : 0,
    y: isBottom ? 50 : 0,
    w: 50,
    h: 50,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const square = searchParams.get("square")?.trim().toUpperCase() || "";
    const quadrant = searchParams.get("quadrant")?.trim().toUpperCase() || "";
    const noMask = searchParams.get("noMask") === "1" || searchParams.get("noMask") === "true";

    if (!square || !parseSquareId(square)) {
      return NextResponse.json({ error: "Invalid or missing square" }, { status: 400 });
    }

    // Fetch Square from exploring map model (exploringMap collection); quadrant statuses drive map colors and layer list
    let dbImage: string | null = null;
    let pathImageUrl: string | null = null;
    let mapCoordinates: { center: { lat: number; lng: number }; bounds: { north: number; south: number; east: number; west: number } } | null = null;
    const quadrantStatuses: Record<string, QuadrantStatus> = { Q1: "unexplored", Q2: "unexplored", Q3: "unexplored", Q4: "unexplored" };
    const quadrantRuinRest: Record<string, number | null> = { Q1: null, Q2: null, Q3: null, Q4: null };
    try {
      await connect();
      const Square = (await import("@/models/mapModel.js")).default;
      const squareIdRegex = new RegExp(`^${square.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
      const doc = await Square.findOne({ squareId: squareIdRegex }).select("image pathImageUrl mapCoordinates quadrants").lean() as {
        image?: string;
        pathImageUrl?: string | null;
        mapCoordinates?: { center?: { lat: number; lng: number }; bounds?: { north: number; south: number; east: number; west: number } };
        quadrants?: Array<{ quadrantId: string; status?: string; ruinRestStamina?: number | null }>;
      } | null;
      if (doc) {
        dbImage = doc.image ?? null;
        pathImageUrl = doc.pathImageUrl ?? null;
        const coords = doc.mapCoordinates;
        if (coords?.center && coords?.bounds) {
          mapCoordinates = {
            center: { lat: coords.center.lat, lng: coords.center.lng },
            bounds: { north: coords.bounds.north, south: coords.bounds.south, east: coords.bounds.east, west: coords.bounds.west },
          };
        }
        if (Array.isArray(doc.quadrants)) {
          for (const q of doc.quadrants) {
            const id = String(q.quadrantId || "").trim().toUpperCase();
            if (id && (id === "Q1" || id === "Q2" || id === "Q3" || id === "Q4")) {
              const raw = typeof q.status === "string" ? String(q.status).trim().toLowerCase() : "";
              quadrantStatuses[id] = (["inaccessible", "unexplored", "explored", "secured"].includes(raw) ? raw : "unexplored") as QuadrantStatus;
              const rest = q.ruinRestStamina;
              quadrantRuinRest[id] = typeof rest === "number" && rest > 0 ? rest : null;
            }
          }
        }
      }
    } catch {
      // DB optional – continue without it
    }

    // Build layers: fog for unexplored/inaccessible quads except party's current quadrant (revealed on move)
    const revealedQuadrant = quadrant && /^Q[1-4]$/i.test(quadrant) ? quadrant.trim().toUpperCase() : undefined;
    let layers = getLayersForSquare(square, { quadrantStatuses, revealedQuadrant });
    if (noMask) {
      layers = layers.filter((l) => l !== "MAP_0001_hidden-areas");
    }
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const prefix = basePath ? basePath.replace(/\/$/, "") : "";
    const layerUrls = layers.map((name) => {
      const defaultUrl = getLayerImageUrl(square, name);
      if (name === "MAP_0002_Map-Base" && pathImageUrl) {
        return { name, url: `${prefix}/api/images/${encodeURIComponent(pathImageUrl)}` };
      }
      return { name, url: defaultUrl };
    });

    const quadrantNum = quadrant.match(/^Q([1-4])$/) ? parseInt(quadrant.slice(1), 10) : null;
    const quadrantBounds = quadrantNum ? getQuadrantBounds(quadrantNum) : null;

    const quadId = quadrant.match(/^Q[1-4]$/i) ? quadrant.trim().toUpperCase() : null;
    return NextResponse.json({
      squareId: square,
      quadrant: quadrant || null,
      layers: layerUrls,
      quadrantStatuses,
      quadrantRuinRest,
      ruinRestStamina: quadId ? quadrantRuinRest[quadId] ?? null : null,
      dbImage,
      mapCoordinates,
      quadrantBounds,
      squareSize: { w: SQUARE_W, h: SQUARE_H },
    });
  } catch (err) {
    console.error("[square-preview]", err);
    return NextResponse.json({ error: "Failed to get square preview" }, { status: 500 });
  }
}
