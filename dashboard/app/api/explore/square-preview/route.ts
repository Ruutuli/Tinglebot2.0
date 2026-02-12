import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";

export const dynamic = "force-dynamic";

const SQUARE_W = 2400;
const SQUARE_H = 1666;
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

/** Squares that have region names */
const REGION_NAME_SQUARES = ["B10", "C3", "E6", "G10", "G4", "G7", "G8", "H4", "H7", "H8"];

/** Path layers per square */
const PSL_SQUARES = ["G6", "H5", "H6", "H7", "H8"];
const LDW_SQUARES = ["F10", "F11", "F9", "G10", "G11", "G8", "G9", "H10", "H11", "H8", "H9"];
const OTHER_PATHS_SQUARES = ["H4", "H5", "H7", "H8", "I8"];

const VILLAGE_CIRCLE_LAYERS = [
  "MAP_0002s_0000s_0000_CIRCLE-INARIKO-CYAN",
  "MAP_0002s_0000s_0001_CIRCLE-INARIKO-PINK",
  "MAP_0002s_0001s_0000_CIRCLE-VHINTL-CYAN",
  "MAP_0002s_0001s_0001_CIRCLE-VHINTL-PINK",
  "MAP_0002s_0002s_0000_CIRCLE-RUDANIA-CYAN",
  "MAP_0002s_0002s_0001_CIRCLE-RUDANIA-PINK",
];

/** Build ordered layer list for a square (matches map-loader logic) */
function getLayersForSquare(squareId: string): string[] {
  const layers: string[] = [];

  // 1. Mask/fog (hidden areas)
  layers.push("MAP_0001_hidden-areas");

  // 2. Blight (if square has blight)
  if (BLIGHT_SQUARES.includes(squareId)) {
    layers.push("MAP_0000_BLIGHT");
  }

  // 3. Base
  layers.push("MAP_0002_Map-Base");

  // 4. Region borders
  layers.push("MAP_0001s_0003_Region-Borders");

  // 5. Village circles (may not exist for all squares – loader adds all, some may 404)
  layers.push(...VILLAGE_CIRCLE_LAYERS);

  // 6. Path layers (square-specific)
  if (PSL_SQUARES.includes(squareId)) layers.push("MAP_0003s_0000_PSL");
  if (LDW_SQUARES.includes(squareId)) layers.push("MAP_0003s_0001_LDW");
  if (OTHER_PATHS_SQUARES.includes(squareId)) layers.push("MAP_0003s_0002_Other-Paths");

  // 7. Region names (square-specific)
  if (REGION_NAME_SQUARES.includes(squareId)) {
    layers.push("MAP_0001s_0004_REGIONS-NAMES");
  }

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

    let layers = getLayersForSquare(square);
    if (noMask) {
      layers = layers.filter((l) => l !== "MAP_0001_hidden-areas");
    }
    const layerUrls = layers.map((name) => ({
      name,
      url: getLayerImageUrl(square, name),
    }));

    // Optional: fetch Square from DB for image URL / metadata
    let dbImage: string | null = null;
    let mapCoordinates: { center: { lat: number; lng: number }; bounds: { north: number; south: number; east: number; west: number } } | null = null;
    try {
      await connect();
      const Square = (await import("@/models/mapModel")).default;
      const doc = await Square.findOne({ squareId: square }).lean();
      if (doc) {
        dbImage = doc.image ?? null;
        const coords = doc.mapCoordinates;
        if (coords?.center && coords?.bounds) {
          mapCoordinates = {
            center: { lat: coords.center.lat, lng: coords.center.lng },
            bounds: { north: coords.bounds.north, south: coords.bounds.south, east: coords.bounds.east, west: coords.bounds.west },
          };
        }
      }
    } catch {
      // DB optional – continue without it
    }

    const quadrantNum = quadrant.match(/^Q([1-4])$/) ? parseInt(quadrant.slice(1), 10) : null;
    const quadrantBounds = quadrantNum ? getQuadrantBounds(quadrantNum) : null;

    return NextResponse.json({
      squareId: square,
      quadrant: quadrant || null,
      layers: layerUrls,
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
