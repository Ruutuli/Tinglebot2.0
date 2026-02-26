import { NextResponse } from "next/server";
import { connect } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/session";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import sharp from "sharp";

export const dynamic = "force-dynamic";

const SQUARE_W = 2400;
const SQUARE_H = 1666;
const GRID_COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const BASE_LAYER = "MAP_0002_Map-Base";
const BASE_LAYER_LEGACY = "base";
const TILE_PATH = `maps/squares/${BASE_LAYER}`;
const TILE_PATH_LEGACY = `maps/squares/${BASE_LAYER_LEGACY}`;
const GCS_TILE_BASE = `https://storage.googleapis.com/tinglebot/${TILE_PATH}`;
const GCS_TILE_BASE_LEGACY = `https://storage.googleapis.com/tinglebot/${TILE_PATH_LEGACY}`;
const OUT_WIDTH = 800;
const OUT_HEIGHT = 556; // 800 * (1666*3)/(2400*3)

async function getAuthenticatedUser() {
  const session = await getSession();
  const user = session.user;
  if (!user?.id) return null;
  return { discordId: user.id };
}

/** Allow only safe characters for filename (Mongo ObjectId is alphanumeric) */
function safePinId(pinId: string): string {
  return pinId.replace(/[^a-zA-Z0-9]/g, "") || "pin";
}

/** Parse gridLocation "H5" to col index (0-9) and row index (0-11) */
function parseGridLocation(gridLocation: string): { colIndex: number; rowIndex: number } | null {
  const m = String(gridLocation).trim().match(/^([A-J])(1[0-2]|[1-9])$/);
  if (!m) return null;
  const colIndex = GRID_COLS.indexOf(m[1]);
  const rowIndex = parseInt(m[2], 10) - 1;
  if (colIndex === -1 || rowIndex < 0 || rowIndex > 11) return null;
  return { colIndex, rowIndex };
}

/** Get 3x3 grid of square IDs centered on gridLocation; null for out-of-bounds */
function getSquareGrid3x3(gridLocation: string): (string | null)[][] {
  const parsed = parseGridLocation(gridLocation);
  if (!parsed) return [];
  const { colIndex, rowIndex } = parsed;
  const grid: (string | null)[][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    const row: (string | null)[] = [];
    for (let dc = -1; dc <= 1; dc++) {
      const c = colIndex + dc;
      const r = rowIndex + dr;
      if (c >= 0 && c <= 9 && r >= 0 && r <= 11) {
        row.push(`${GRID_COLS[c]}${r + 1}`);
      } else {
        row.push(null);
      }
    }
    grid.push(row);
  }
  return grid;
}

/** Revalidate for tile fetches (1h) so repeated snippet generations reuse cached tiles. */
const TILE_REVALIDATE_SECONDS = 3600;

/** Fetch tile image buffer. Tries direct GCS first (avoids dashboard proxy egress), then app proxy; tries legacy "base" path if needed. */
async function fetchTileBuffer(squareId: string, appOrigin?: string): Promise<Buffer | null> {
  const filenameBase = `${BASE_LAYER}_${squareId}.png`;
  const filenameLegacy = `${BASE_LAYER_LEGACY}_${squareId}.png`;
  const urlsToTry: string[] = [
    `${GCS_TILE_BASE}/${filenameBase}`,
    `${GCS_TILE_BASE_LEGACY}/${filenameLegacy}`,
  ];
  if (appOrigin) {
    urlsToTry.push(`${appOrigin}/api/images/${TILE_PATH}/${filenameBase}`);
    urlsToTry.push(`${appOrigin}/api/images/${TILE_PATH_LEGACY}/${filenameLegacy}`);
  }

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, { next: { revalidate: TILE_REVALIDATE_SECONDS } });
      if (res.ok) {
        const ab = await res.arrayBuffer();
        return Buffer.from(ab);
      }
    } catch {
      continue;
    }
  }
  return null;
}

/** Map pin coordinates to pixel position in the 3x3 output image (base layer only) */
function pinToPixel(
  lat: number,
  lng: number,
  gridLocation: string
): { x: number; y: number } | null {
  const parsed = parseGridLocation(gridLocation);
  if (!parsed) return null;
  const { colIndex, rowIndex } = parsed;
  const viewportX0 = (colIndex - 1) * SQUARE_W;
  const viewportY0 = (rowIndex - 1) * SQUARE_H;
  const viewportW = 3 * SQUARE_W;
  const viewportH = 3 * SQUARE_H;
  const relX = lng - viewportX0;
  const relY = lat - viewportY0;
  const x = (relX / viewportW) * OUT_WIDTH;
  const y = (relY / viewportH) * OUT_HEIGHT;
  if (x < 0 || x > OUT_WIDTH || y < 0 || y > OUT_HEIGHT) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

/** SVG for a map pin marker: circle with white outline so it’s visible on the base map */
function pinMarkerSvg(size: number, colorHex: string): string {
  const r = size / 2;
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${c}" cy="${c}" r="${r - 2}" fill="${colorHex}" stroke="#fff" stroke-width="2"/>
</svg>`;
}

/** Generate a map snapshot PNG: base map layer only, with pin marker. Returns imageUrl or null. */
async function generateMapSnapshot(
  pinId: string,
  gridLocation: string,
  coordinates: { lat: number; lng: number } | null,
  pinColor: string = "#00A3DA",
  appOrigin?: string
): Promise<string | null> {
  const grid = getSquareGrid3x3(gridLocation);
  if (grid.length === 0) return null;

  const tileW = Math.floor(OUT_WIDTH / 3);
  const tileH = Math.floor(OUT_HEIGHT / 3);
  const composites: { input: Buffer; top: number; left: number }[] = [];

  // Only base map layer tiles (same source as the map UI)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const squareId = grid[row]?.[col] ?? null;
      if (squareId) {
        const buf = await fetchTileBuffer(squareId, appOrigin);
        if (buf) {
          const resized = await sharp(buf)
            .resize(tileW, tileH, { fit: "fill" })
            .toBuffer();
          composites.push({
            input: resized,
            top: row * tileH,
            left: col * tileW,
          });
        }
      }
    }
  }
  if (composites.length === 0) return null;

  let pipeline = sharp({
    create: {
      width: OUT_WIDTH,
      height: OUT_HEIGHT,
      channels: 3,
      background: { r: 26, g: 26, b: 26 },
    },
  })
    .composite(composites);

  // Draw pin marker on top of base layer (centered on pin coordinates)
  const pinPos = coordinates
    ? pinToPixel(coordinates.lat, coordinates.lng, gridLocation)
    : { x: OUT_WIDTH / 2, y: OUT_HEIGHT / 2 };
  if (pinPos) {
    const pinSize = 32;
    const svg = Buffer.from(pinMarkerSvg(pinSize, pinColor));
    const pinLeft = Math.round(Math.max(0, Math.min(OUT_WIDTH - pinSize, pinPos.x - pinSize / 2)));
    const pinTop = Math.round(Math.max(0, Math.min(OUT_HEIGHT - pinSize, pinPos.y - pinSize / 2)));
    const pinBuf = await sharp(svg).resize(pinSize, pinSize).toBuffer();
    pipeline = pipeline.composite([{ input: pinBuf, left: pinLeft, top: pinTop }]);
  }

  const output = await pipeline.png().toBuffer();

  const dir = path.join(process.cwd(), "public", "uploads", "pins");
  await mkdir(dir, { recursive: true });
  const safeId = safePinId(pinId);
  const filename = `${safeId}.png`;
  const filePath = path.join(dir, filename);
  await writeFile(filePath, output);
  return `/uploads/pins/${filename}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id: pinId } = await params;
  if (!pinId) {
    return NextResponse.json({ error: "Pin ID required" }, { status: 400 });
  }

  try {
    await connect();
    const Pin = (await import("../../../../../models/PinModel.js")).default;

    const pin = await Pin.findById(pinId);
    if (!pin) {
      return NextResponse.json({ error: "Pin not found" }, { status: 404 });
    }
    if (pin.discordId !== auth.discordId) {
      return NextResponse.json({ error: "You can only update your own pins" }, { status: 403 });
    }

    const contentType = request.headers.get("content-type") || "";
    let imageData: string;

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { image?: string };
      const raw = body.image;
      if (typeof raw !== "string" || !raw.startsWith("data:image")) {
        return NextResponse.json({ error: "Missing or invalid image (expect data URL)" }, { status: 400 });
      }
      const base64 = raw.replace(/^data:image\/\w+;base64,/, "");
      if (!base64) {
        return NextResponse.json({ error: "Invalid base64 image" }, { status: 400 });
      }
      imageData = base64;
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("image") as File | null;
      if (!file || !file.size) {
        return NextResponse.json({ error: "Missing image file" }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      imageData = buf.toString("base64");
    } else {
      return NextResponse.json({ error: "Send JSON { image: 'data:image/...' } or multipart with 'image' file" }, { status: 400 });
    }

    const buf = Buffer.from(imageData, "base64");
    const dir = path.join(process.cwd(), "public", "uploads", "pins");
    await mkdir(dir, { recursive: true });
    const safeId = safePinId(pinId);
    const filename = `${safeId}.png`;
    const filePath = path.join(dir, filename);
    await writeFile(filePath, buf);

    const imageUrl = `/uploads/pins/${filename}`;
    pin.imageUrl = imageUrl;
    await pin.save();
    await pin.populate("character", "name");

    return NextResponse.json({ success: true, pin: pin.toObject(), imageUrl });
  } catch (error) {
    console.error("[api/pins] snippet POST error:", error);
    return NextResponse.json({ error: "Failed to save map snippet" }, { status: 500 });
  }
}

/** GET with ?generate=1: generate map snapshot from tiles server-side (no browser capture) */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get("generate") !== "1") {
    return NextResponse.json({ error: "Use ?generate=1 to generate snapshot" }, { status: 400 });
  }

  const { id: pinId } = await params;
  if (!pinId) {
    return NextResponse.json({ error: "Pin ID required" }, { status: 400 });
  }

  try {
    await connect();
    const Pin = (await import("../../../../../models/PinModel.js")).default;

    const pin = await Pin.findById(pinId);
    if (!pin) {
      return NextResponse.json({ error: "Pin not found" }, { status: 404 });
    }
    if (pin.discordId !== auth.discordId) {
      return NextResponse.json({ error: "You can only update your own pins" }, { status: 403 });
    }

    // Don't overwrite if the user has already uploaded their own image
    const existingImage = pin.imageUrl && String(pin.imageUrl).trim();
    if (existingImage) {
      await pin.populate("character", "name");
      return NextResponse.json({ success: true, pin: pin.toObject(), imageUrl: existingImage });
    }

    const gridLocation = pin.gridLocation ?? (pin as { calculateGridLocation?: () => string }).calculateGridLocation?.();
    if (!gridLocation || typeof gridLocation !== "string") {
      return NextResponse.json({ error: "Pin has no grid location" }, { status: 400 });
    }

    const coords = pin.coordinates && typeof pin.coordinates.lat === "number" && typeof pin.coordinates.lng === "number"
      ? { lat: pin.coordinates.lat, lng: pin.coordinates.lng }
      : null;
    const pinColor = (pin.color && /^#[0-9A-Fa-f]{6}$/.test(String(pin.color))) ? String(pin.color) : "#00A3DA";

    const appOrigin = request.url ? new URL(request.url).origin : undefined;
    const imageUrl = await generateMapSnapshot(pinId, gridLocation, coords, pinColor, appOrigin);
    if (!imageUrl) {
      return NextResponse.json({ error: "Failed to generate map snapshot (tiles may be unavailable)" }, { status: 502 });
    }

    pin.imageUrl = imageUrl;
    await pin.save();
    await pin.populate("character", "name");

    return NextResponse.json({ success: true, pin: pin.toObject(), imageUrl });
  } catch (error) {
    console.error("[api/pins] snippet GET generate error:", error);
    return NextResponse.json({ error: "Failed to generate map snapshot" }, { status: 500 });
  }
}
