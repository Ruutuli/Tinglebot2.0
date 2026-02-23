import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { connect } from "@/lib/db";
import { SQUARE_W, SQUARE_H, GCS_BASE, BASE_LAYER } from "@/lib/explorePathImageConstants";

export const dynamic = "force-dynamic";

const GRID_COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const GCS_IMAGES_PATH = "maps/squares/";

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
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
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

    const baseUrl = pathImageUrl || getLayerImageUrl(square, BASE_LAYER);
    const baseBuf = await fetchImageBuffer(baseUrl);
    if (!baseBuf) {
      return NextResponse.json({ error: "Failed to load base map image" }, { status: 502 });
    }

    let composite = sharp(baseBuf).resize(SQUARE_W, SQUARE_H);

    if (BLIGHT_SQUARES.includes(square)) {
      const blightBuf = await fetchImageBuffer(getLayerImageUrl(square, "MAP_0000_BLIGHT"));
      if (blightBuf) compositeInputs.push({ input: blightBuf });
    }

    const borderBuf = await fetchImageBuffer(getLayerImageUrl(square, "MAP_0001s_0003_Region-Borders"));
    if (borderBuf) compositeInputs.push({ input: borderBuf });

    if (PSL_SQUARES.includes(square)) {
      const pslBuf = await fetchImageBuffer(getLayerImageUrl(square, "MAP_0003s_0000_PSL"));
      if (pslBuf) compositeInputs.push({ input: pslBuf });
    }
    if (LDW_SQUARES.includes(square)) {
      const ldwBuf = await fetchImageBuffer(getLayerImageUrl(square, "MAP_0003s_0001_LDW"));
      if (ldwBuf) compositeInputs.push({ input: ldwBuf });
    }
    if (OTHER_PATHS_SQUARES.includes(square)) {
      const otherBuf = await fetchImageBuffer(getLayerImageUrl(square, "MAP_0003s_0002_Other-Paths"));
      if (otherBuf) compositeInputs.push({ input: otherBuf });
    }

    for (const layer of getVillageCircleLayersForSquare(square)) {
      const circleBuf = await fetchImageBuffer(getLayerImageUrl(square, layer));
      if (circleBuf) compositeInputs.push({ input: circleBuf });
    }

    if (!noMask && fogQuadrants.length > 0) {
      const fogBuf = await fetchImageBuffer(getLayerImageUrl(square, "MAP_0001_hidden-areas"));
      if (fogBuf) {
        const halfW = Math.floor(SQUARE_W / 2);
        const halfH = Math.floor(SQUARE_H / 2);
        for (const q of fogQuadrants) {
          let left = 0, top = 0;
          if (q === "Q2" || q === "Q4") left = halfW;
          if (q === "Q3" || q === "Q4") top = halfH;
          const quadrantFog = await sharp(fogBuf)
            .extract({ left, top, width: halfW, height: halfH })
            .toBuffer();
          compositeInputs.push({ input: quadrantFog, left, top });
        }
      }
    }

    // Add grid lines and quadrant labels
    const halfW = Math.floor(SQUARE_W / 2);
    const halfH = Math.floor(SQUARE_H / 2);
    const gridLineWidth = 8;
    const labelPadding = 25;
    
    // Create grid lines using raw pixel data (vertical line) - WHITE, fully opaque
    const vertLinePixels = Buffer.alloc(gridLineWidth * SQUARE_H * 4);
    for (let i = 0; i < gridLineWidth * SQUARE_H; i++) {
      vertLinePixels[i * 4] = 255;     // R
      vertLinePixels[i * 4 + 1] = 255; // G
      vertLinePixels[i * 4 + 2] = 255; // B
      vertLinePixels[i * 4 + 3] = 200; // A (mostly opaque)
    }
    const vertLineBuf = await sharp(vertLinePixels, {
      raw: { width: gridLineWidth, height: SQUARE_H, channels: 4 }
    }).png().toBuffer();
    compositeInputs.push({ input: vertLineBuf, left: halfW - Math.floor(gridLineWidth / 2), top: 0 });
    
    // Horizontal line - WHITE, fully opaque
    const horizLinePixels = Buffer.alloc(SQUARE_W * gridLineWidth * 4);
    for (let i = 0; i < SQUARE_W * gridLineWidth; i++) {
      horizLinePixels[i * 4] = 255;     // R
      horizLinePixels[i * 4 + 1] = 255; // G
      horizLinePixels[i * 4 + 2] = 255; // B
      horizLinePixels[i * 4 + 3] = 200; // A
    }
    const horizLineBuf = await sharp(horizLinePixels, {
      raw: { width: SQUARE_W, height: gridLineWidth, channels: 4 }
    }).png().toBuffer();
    compositeInputs.push({ input: horizLineBuf, left: 0, top: halfH - Math.floor(gridLineWidth / 2) });

    // Create quadrant labels as PNG images with text rendered via sharp's text feature
    // Since SVG text may not work reliably, we'll create simple colored rectangles with text overlays
    const quadrantLabelConfigs: Array<{ label: string; left: number; top: number; isCurrentQuadrant: boolean }> = [
      { label: "Q1", left: labelPadding, top: labelPadding, isCurrentQuadrant: revealedQuadrant === "Q1" },
      { label: "Q2", left: halfW + labelPadding, top: labelPadding, isCurrentQuadrant: revealedQuadrant === "Q2" },
      { label: "Q3", left: labelPadding, top: halfH + labelPadding, isCurrentQuadrant: revealedQuadrant === "Q3" },
      { label: "Q4", left: halfW + labelPadding, top: halfH + labelPadding, isCurrentQuadrant: revealedQuadrant === "Q4" },
    ];

    // Try creating labels using sharp's text input (requires pango/fontconfig)
    for (const { label, left, top, isCurrentQuadrant } of quadrantLabelConfigs) {
      try {
        const textColor = isCurrentQuadrant ? "#00FF88" : "#FFFFFF";
        const labelBuf = await sharp({
          text: {
            text: `<span foreground="${textColor}" font_weight="bold">${label}</span>`,
            font: "Sans Bold 48",
            rgba: true,
            dpi: 150,
          }
        }).png().toBuffer();
        compositeInputs.push({ input: labelBuf, left, top });
      } catch (textErr) {
        // Fallback: try SVG if text input fails
        console.log("[square-image] Text input failed, trying SVG for label:", label);
        try {
          const fillColor = isCurrentQuadrant ? "#00FF88" : "#FFFFFF";
          const svgLabel = Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="70">` +
            `<text x="5" y="50" font-family="sans-serif" font-size="50" font-weight="bold" ` +
            `fill="${fillColor}" stroke="#000" stroke-width="3" paint-order="stroke">${label}</text>` +
            `</svg>`
          );
          const labelBuf = await sharp(svgLabel).png().toBuffer();
          compositeInputs.push({ input: labelBuf, left, top });
        } catch (svgErr) {
          console.error("[square-image] Both text and SVG label failed for:", label, svgErr);
        }
      }
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
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (err) {
    console.error("[square-image]", err);
    return NextResponse.json({ error: "Failed to generate square image" }, { status: 500 });
  }
}
