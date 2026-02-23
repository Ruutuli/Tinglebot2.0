import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { connect } from "@/lib/db";
import { SQUARE_W, SQUARE_H, GCS_BASE, BASE_LAYER } from "@/lib/explorePathImageConstants";

export const dynamic = "force-dynamic";

const GRID_COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const GCS_IMAGES_PATH = "maps/squares/";

// In-memory cache for layer images (persists across requests in the same server instance)
const imageCache = new Map<string, { buffer: Buffer; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Pre-generated grid overlays (generated once and reused)
let cachedGridLines: { vertLine: Buffer; horizLine: Buffer } | null = null;
const cachedLabels = new Map<string, Buffer>(); // key: "Q1_white", "Q1_green", etc.

function parseSquareId(squareId: string): boolean {
  const m = String(squareId).trim().match(/^([A-J])(1[0-2]|[1-9])$/);
  if (!m) return false;
  const colIndex = GRID_COLS.indexOf(m[1]);
  const row = parseInt(m[2], 10);
  return colIndex >= 0 && row >= 1 && row <= 12;
}

function getLayerImageUrl(squareId: string, layerName: string): string {
  const filename = `${layerName}_${squareId}.png`;
  return `${GCS_BASE}/${GCS_IMAGES_PATH}${layerName}/${filename}`;
}

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

const PSL_SQUARES = ["G6", "H5", "H6", "H7", "H8"];
const LDW_SQUARES = ["F10", "F11", "F9", "G10", "G11", "G8", "G9", "H10", "H11", "H8", "H9"];
const OTHER_PATHS_SQUARES = ["H4", "H5", "H7", "H8", "I8"];

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

type QuadrantStatus = "inaccessible" | "unexplored" | "explored" | "secured";

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  // Check cache first
  const cached = imageCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.buffer;
  }
  
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    // Cache the result
    imageCache.set(url, { buffer, timestamp: Date.now() });
    // Cleanup old cache entries periodically (keep cache size reasonable)
    if (imageCache.size > 200) {
      const now = Date.now();
      for (const [key, value] of imageCache.entries()) {
        if (now - value.timestamp > CACHE_TTL_MS) {
          imageCache.delete(key);
        }
      }
    }
    return buffer;
  } catch {
    return null;
  }
}

/**
 * GET /api/explore/square-image - Render a composited map square image.
 * Query params:
 *   - square: Square ID (e.g., H8) - required
 *   - quadrant: Current quadrant (e.g., Q3) - optional, highlights this quadrant
 *   - noMask: "1" or "true" to skip fog layers - optional
 *   - highlight: "1" or "true" to draw a highlight border on the current quadrant - optional
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const square = searchParams.get("square")?.trim().toUpperCase() || "";
    const quadrant = searchParams.get("quadrant")?.trim().toUpperCase() || "";
    const noMask = searchParams.get("noMask") === "1" || searchParams.get("noMask") === "true";
    const highlight = searchParams.get("highlight") === "1" || searchParams.get("highlight") === "true";

    if (!square || !parseSquareId(square)) {
      return NextResponse.json({ error: "Invalid or missing square" }, { status: 400 });
    }

    let pathImageUrl: string | null = null;
    const quadrantStatuses: Record<string, QuadrantStatus> = { Q1: "unexplored", Q2: "unexplored", Q3: "unexplored", Q4: "unexplored" };

    try {
      await connect();
      const Square = (await import("@/models/mapModel.js")).default;
      const squareIdRegex = new RegExp(`^${square.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
      const doc = await Square.findOne({ squareId: squareIdRegex }).select("pathImageUrl quadrants").lean() as {
        pathImageUrl?: string | null;
        quadrants?: Array<{ quadrantId: string; status?: string }>;
      } | null;
      if (doc) {
        pathImageUrl = doc.pathImageUrl ?? null;
        if (Array.isArray(doc.quadrants)) {
          for (const q of doc.quadrants) {
            const id = String(q.quadrantId || "").trim().toUpperCase();
            if (id && (id === "Q1" || id === "Q2" || id === "Q3" || id === "Q4")) {
              const raw = typeof q.status === "string" ? String(q.status).trim().toLowerCase() : "";
              quadrantStatuses[id] = (["inaccessible", "unexplored", "explored", "secured"].includes(raw) ? raw : "unexplored") as QuadrantStatus;
            }
          }
        }
      }
    } catch {
      // DB optional
    }

    const revealedQuadrant = quadrant && /^Q[1-4]$/i.test(quadrant) ? quadrant.trim().toUpperCase() : undefined;
    const fogQuadrants = (["Q1", "Q2", "Q3", "Q4"] as const).filter((q) => {
      const status = quadrantStatuses[q] ?? "unexplored";
      const isUnexploredOrInaccessible = status === "unexplored" || status === "inaccessible";
      const isCurrentQuadrant = revealedQuadrant && q === revealedQuadrant;
      return isUnexploredOrInaccessible && !isCurrentQuadrant;
    });

    const compositeInputs: sharp.OverlayOptions[] = [];

    // Build list of all layer URLs to fetch in parallel
    const layerFetches: Array<{ key: string; url: string }> = [];
    
    const baseUrl = pathImageUrl || getLayerImageUrl(square, BASE_LAYER);
    layerFetches.push({ key: "base", url: baseUrl });
    
    if (BLIGHT_SQUARES.includes(square)) {
      layerFetches.push({ key: "blight", url: getLayerImageUrl(square, "MAP_0000_BLIGHT") });
    }
    layerFetches.push({ key: "border", url: getLayerImageUrl(square, "MAP_0001s_0003_Region-Borders") });
    
    if (PSL_SQUARES.includes(square)) {
      layerFetches.push({ key: "psl", url: getLayerImageUrl(square, "MAP_0003s_0000_PSL") });
    }
    if (LDW_SQUARES.includes(square)) {
      layerFetches.push({ key: "ldw", url: getLayerImageUrl(square, "MAP_0003s_0001_LDW") });
    }
    if (OTHER_PATHS_SQUARES.includes(square)) {
      layerFetches.push({ key: "other", url: getLayerImageUrl(square, "MAP_0003s_0002_Other-Paths") });
    }
    
    for (const layer of getVillageCircleLayersForSquare(square)) {
      layerFetches.push({ key: `circle_${layer}`, url: getLayerImageUrl(square, layer) });
    }
    
    if (!noMask && fogQuadrants.length > 0) {
      layerFetches.push({ key: "fog", url: getLayerImageUrl(square, "MAP_0001_hidden-areas") });
    }

    // Fetch all layers in parallel
    const fetchResults = await Promise.all(
      layerFetches.map(async ({ key, url }) => ({
        key,
        buffer: await fetchImageBuffer(url),
      }))
    );
    
    const layers: Record<string, Buffer | null> = {};
    for (const { key, buffer } of fetchResults) {
      layers[key] = buffer;
    }

    if (!layers.base) {
      return NextResponse.json({ error: "Failed to load base map image" }, { status: 502 });
    }

    let composite = sharp(layers.base).resize(SQUARE_W, SQUARE_H);

    if (layers.blight) compositeInputs.push({ input: layers.blight });
    if (layers.border) compositeInputs.push({ input: layers.border });
    if (layers.psl) compositeInputs.push({ input: layers.psl });
    if (layers.ldw) compositeInputs.push({ input: layers.ldw });
    if (layers.other) compositeInputs.push({ input: layers.other });
    
    for (const layer of getVillageCircleLayersForSquare(square)) {
      const circleBuf = layers[`circle_${layer}`];
      if (circleBuf) compositeInputs.push({ input: circleBuf });
    }

    if (!noMask && fogQuadrants.length > 0 && layers.fog) {
      const halfW = Math.floor(SQUARE_W / 2);
      const halfH = Math.floor(SQUARE_H / 2);
      for (const q of fogQuadrants) {
        let left = 0, top = 0;
        if (q === "Q2" || q === "Q4") left = halfW;
        if (q === "Q3" || q === "Q4") top = halfH;
        const quadrantFog = await sharp(layers.fog)
          .extract({ left, top, width: halfW, height: halfH })
          .toBuffer();
        compositeInputs.push({ input: quadrantFog, left, top });
      }
    }

    // Add grid lines and quadrant labels (using cached versions when possible)
    const halfW = Math.floor(SQUARE_W / 2);
    const halfH = Math.floor(SQUARE_H / 2);
    const gridLineWidth = 8;
    const labelPadding = 25;
    
    // Generate and cache grid lines (only once per server lifetime)
    if (!cachedGridLines) {
      const vertLinePixels = Buffer.alloc(gridLineWidth * SQUARE_H * 4);
      for (let i = 0; i < gridLineWidth * SQUARE_H; i++) {
        vertLinePixels[i * 4] = 255;
        vertLinePixels[i * 4 + 1] = 255;
        vertLinePixels[i * 4 + 2] = 255;
        vertLinePixels[i * 4 + 3] = 200;
      }
      const vertLine = await sharp(vertLinePixels, {
        raw: { width: gridLineWidth, height: SQUARE_H, channels: 4 }
      }).png().toBuffer();
      
      const horizLinePixels = Buffer.alloc(SQUARE_W * gridLineWidth * 4);
      for (let i = 0; i < SQUARE_W * gridLineWidth; i++) {
        horizLinePixels[i * 4] = 255;
        horizLinePixels[i * 4 + 1] = 255;
        horizLinePixels[i * 4 + 2] = 255;
        horizLinePixels[i * 4 + 3] = 200;
      }
      const horizLine = await sharp(horizLinePixels, {
        raw: { width: SQUARE_W, height: gridLineWidth, channels: 4 }
      }).png().toBuffer();
      
      cachedGridLines = { vertLine, horizLine };
    }
    
    compositeInputs.push({ input: cachedGridLines.vertLine, left: halfW - Math.floor(gridLineWidth / 2), top: 0 });
    compositeInputs.push({ input: cachedGridLines.horizLine, left: 0, top: halfH - Math.floor(gridLineWidth / 2) });

    // SVG paths for Q and digits 1-4 (simplified blocky style that doesn't need fonts)
    const qPath = "M10,5 L35,5 L40,10 L40,35 L35,40 L25,40 L30,50 L20,50 L15,40 L10,40 L5,35 L5,10 L10,5 Z M15,15 L15,30 L30,30 L30,15 Z";
    const digitPaths: Record<string, string> = {
      "1": "M55,5 L65,5 L65,50 L55,50 L55,15 L50,15 L50,5 Z",
      "2": "M50,5 L75,5 L75,15 L60,15 L60,22 L75,22 L75,50 L50,50 L50,40 L65,40 L65,32 L50,32 Z",
      "3": "M50,5 L75,5 L75,50 L50,50 L50,40 L65,40 L65,32 L55,32 L55,22 L65,22 L65,15 L50,15 Z",
      "4": "M50,5 L60,5 L60,20 L65,20 L65,5 L75,5 L75,50 L65,50 L65,30 L50,30 Z",
    };

    // Generate and cache label images
    const quadrantLabelConfigs: Array<{ num: string; left: number; top: number; isCurrentQuadrant: boolean }> = [
      { num: "1", left: labelPadding, top: labelPadding, isCurrentQuadrant: revealedQuadrant === "Q1" },
      { num: "2", left: halfW + labelPadding, top: labelPadding, isCurrentQuadrant: revealedQuadrant === "Q2" },
      { num: "3", left: labelPadding, top: halfH + labelPadding, isCurrentQuadrant: revealedQuadrant === "Q3" },
      { num: "4", left: halfW + labelPadding, top: halfH + labelPadding, isCurrentQuadrant: revealedQuadrant === "Q4" },
    ];

    for (const { num, left, top, isCurrentQuadrant } of quadrantLabelConfigs) {
      const colorKey = isCurrentQuadrant ? "green" : "white";
      const cacheKey = `Q${num}_${colorKey}`;
      
      let labelBuf = cachedLabels.get(cacheKey);
      if (!labelBuf) {
        const fillColor = isCurrentQuadrant ? "#00FF88" : "#FFFFFF";
        const strokeColor = "#000000";
        const digitPath = digitPaths[num] || "";
        
        const svgLabel = Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="55" viewBox="0 0 80 55">` +
          `<path d="${qPath}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2"/>` +
          `<path d="${digitPath}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2"/>` +
          `</svg>`
        );
        
        try {
          labelBuf = await sharp(svgLabel).png().toBuffer();
          cachedLabels.set(cacheKey, labelBuf);
        } catch (svgErr) {
          console.error("[square-image] SVG path label failed for Q" + num + ":", svgErr);
          continue;
        }
      }
      
      compositeInputs.push({ input: labelBuf, left, top });
    }

    // Add highlight border on current quadrant
    if (highlight && revealedQuadrant) {
      let left = 0, top = 0;
      if (revealedQuadrant === "Q2" || revealedQuadrant === "Q4") left = halfW;
      if (revealedQuadrant === "Q3" || revealedQuadrant === "Q4") top = halfH;

      const borderWidth = 12;
      // Create border using 4 rectangles (top, bottom, left, right edges)
      const borderColor = { r: 0, g: 200, b: 100, a: 240 };
      
      // Top edge
      const topEdgePixels = Buffer.alloc(halfW * borderWidth * 4);
      for (let i = 0; i < halfW * borderWidth; i++) {
        topEdgePixels[i * 4] = borderColor.r;
        topEdgePixels[i * 4 + 1] = borderColor.g;
        topEdgePixels[i * 4 + 2] = borderColor.b;
        topEdgePixels[i * 4 + 3] = borderColor.a;
      }
      const topEdgeBuf = await sharp(topEdgePixels, {
        raw: { width: halfW, height: borderWidth, channels: 4 }
      }).png().toBuffer();
      compositeInputs.push({ input: topEdgeBuf, left, top });
      
      // Bottom edge
      compositeInputs.push({ input: topEdgeBuf, left, top: top + halfH - borderWidth });
      
      // Left edge
      const leftEdgePixels = Buffer.alloc(borderWidth * halfH * 4);
      for (let i = 0; i < borderWidth * halfH; i++) {
        leftEdgePixels[i * 4] = borderColor.r;
        leftEdgePixels[i * 4 + 1] = borderColor.g;
        leftEdgePixels[i * 4 + 2] = borderColor.b;
        leftEdgePixels[i * 4 + 3] = borderColor.a;
      }
      const leftEdgeBuf = await sharp(leftEdgePixels, {
        raw: { width: borderWidth, height: halfH, channels: 4 }
      }).png().toBuffer();
      compositeInputs.push({ input: leftEdgeBuf, left, top });
      
      // Right edge
      compositeInputs.push({ input: leftEdgeBuf, left: left + halfW - borderWidth, top });
    }

    if (compositeInputs.length > 0) {
      composite = composite.composite(compositeInputs);
    }

    const outputBuffer = await composite.png({ compressionLevel: 6 }).toBuffer();

    return new NextResponse(new Uint8Array(outputBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=60, s-maxage=120",
      },
    });
  } catch (err) {
    console.error("[square-image]", err);
    return NextResponse.json({ error: "Failed to generate square image" }, { status: 500 });
  }
}
