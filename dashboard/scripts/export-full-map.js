// ============================================================================
// Export Full Map (with regions) - Base + region borders + region names + grid
// ============================================================================
// No blight. Fetches base, region borders, region names from GCS; composites
// in grid order; draws grid lines and square/quadrant labels. Output: one PNG.
//
// Usage: node scripts/export-full-map.js [output.png]
//
// Requires: npm install sharp (in dashboard)
// ============================================================================

const fs = require('fs');
const path = require('path');
const https = require('https');

const SQUARE_W = 2400;
const SQUARE_H = 1666;
const GRID_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const GRID_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const GCS_BASE_URL = 'https://storage.googleapis.com';
const GCS_BUCKET = 'tinglebot';
const BASE_LAYER = 'MAP_0002_Map-Base';
const REGION_BORDERS_LAYER = 'MAP_0001s_0003_Region-Borders';
const REGION_NAMES_LAYER = 'MAP_0001s_0004_REGIONS-NAMES';

const FULL_W = GRID_COLS.length * SQUARE_W;
const FULL_H = GRID_ROWS.length * SQUARE_H;

function getSquareImageUrl(squareId, layerName) {
  const layer = layerName || BASE_LAYER;
  const filename = `${layer}_${squareId}.png`;
  return `${GCS_BASE_URL}/${GCS_BUCKET}/maps/squares/${layer}/${filename}`;
}

function fetchImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function loadLayer(squareIds, layerName, label) {
  const CONCURRENCY = 8;
  const composites = [];
  let failed = 0;

  async function loadTile(squareId) {
    const col = squareId.replace(/\d+/, '');
    const rowNum = parseInt(squareId.replace(/[A-J]/i, ''), 10);
    const colIndex = GRID_COLS.indexOf(col);
    const rowIndex = GRID_ROWS.indexOf(rowNum);
    const left = colIndex * SQUARE_W;
    const top = rowIndex * SQUARE_H;
    const url = getSquareImageUrl(squareId, layerName);
    try {
      const buf = await fetchImage(url);
      return { squareId, buf, left, top };
    } catch (err) {
      return { squareId, err: err.message };
    }
  }

  for (let start = 0; start < squareIds.length; start += CONCURRENCY) {
    const batch = squareIds.slice(start, start + CONCURRENCY).map((sid) => loadTile(sid));
    const results = await Promise.all(batch);
    for (const r of results) {
      if (r.err) {
        failed++;
      } else {
        composites.push({ input: r.buf, left: r.left, top: r.top });
      }
    }
    process.stdout.write(`\r${label}: ${composites.length + failed}/${squareIds.length}   `);
  }
  console.log('');
  return composites;
}

async function main() {
  const sharp = require('sharp');

  const outPath = path.resolve(
    path.join(__dirname, '..'),
    process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : 'full-map.png'
  );

  const squareIds = [];
  for (const row of GRID_ROWS) {
    for (const col of GRID_COLS) {
      squareIds.push(`${col}${row}`);
    }
  }

  console.log(`Exporting ${squareIds.length} squares (${GRID_COLS.length}×${GRID_ROWS.length}) → ${FULL_W}×${FULL_H} px`);
  console.log(`Layers: base + region borders + region names + grid & labels (no blight)`);
  console.log(`Output: ${outPath}`);

  const baseComposites = await loadLayer(squareIds, BASE_LAYER, 'Base');
  if (baseComposites.length === 0) {
    console.error('No base images loaded. Aborting.');
    process.exit(1);
  }

  const regionBordersComposites = await loadLayer(squareIds, REGION_BORDERS_LAYER, 'Region borders');
  const regionNamesComposites = await loadLayer(squareIds, REGION_NAMES_LAYER, 'Region names');

  console.log('Building grid and labels overlay...');
  const QUAD_INSET = 60;
  const SQUARE_FONT_SIZE = 72;
  const QUAD_FONT_SIZE = 40;
  const GRID_STROKE = 4;
  const QUAD_CROSS_STROKE = 2;
  const lines = [];
  for (let i = 0; i <= GRID_COLS.length; i++) {
    const x = i * SQUARE_W;
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${FULL_H}" stroke="white" stroke-width="${GRID_STROKE}"/>`);
  }
  for (let i = 0; i <= GRID_ROWS.length; i++) {
    const y = i * SQUARE_H;
    lines.push(`<line x1="0" y1="${y}" x2="${FULL_W}" y2="${y}" stroke="white" stroke-width="${GRID_STROKE}"/>`);
  }
  for (let rowIndex = 0; rowIndex < GRID_ROWS.length; rowIndex++) {
    for (let colIndex = 0; colIndex < GRID_COLS.length; colIndex++) {
      const x0 = colIndex * SQUARE_W;
      const y0 = rowIndex * SQUARE_H;
      const cx = x0 + SQUARE_W / 2;
      const cy = y0 + SQUARE_H / 2;
      lines.push(`<line x1="${x0}" y1="${cy}" x2="${x0 + SQUARE_W}" y2="${cy}" stroke="white" stroke-width="${QUAD_CROSS_STROKE}" stroke-opacity="0.5" stroke-dasharray="8,8"/>`);
      lines.push(`<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y0 + SQUARE_H}" stroke="white" stroke-width="${QUAD_CROSS_STROKE}" stroke-opacity="0.5" stroke-dasharray="8,8"/>`);
    }
  }
  const squareTexts = [];
  const quadTexts = [];
  for (let rowIndex = 0; rowIndex < GRID_ROWS.length; rowIndex++) {
    for (let colIndex = 0; colIndex < GRID_COLS.length; colIndex++) {
      const squareId = `${GRID_COLS[colIndex]}${GRID_ROWS[rowIndex]}`;
      const x0 = colIndex * SQUARE_W;
      const y0 = rowIndex * SQUARE_H;
      const cx = x0 + SQUARE_W / 2;
      const cy = y0 + SQUARE_H / 2;
      squareTexts.push(
        `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI,sans-serif" font-weight="bold" font-size="${SQUARE_FONT_SIZE}" fill="white" stroke="black" stroke-width="3">${squareId}</text>`
      );
      const q1 = [x0 + QUAD_INSET, y0 + QUAD_INSET];
      const q2 = [x0 + SQUARE_W - QUAD_INSET, y0 + QUAD_INSET];
      const q3 = [x0 + QUAD_INSET, y0 + SQUARE_H - QUAD_INSET];
      const q4 = [x0 + SQUARE_W - QUAD_INSET, y0 + SQUARE_H - QUAD_INSET];
      for (const [qx, qy, label] of [[q1[0], q1[1], 'Q1'], [q2[0], q2[1], 'Q2'], [q3[0], q3[1], 'Q3'], [q4[0], q4[1], 'Q4']]) {
        quadTexts.push(
          `<text x="${qx}" y="${qy}" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI,sans-serif" font-weight="bold" font-size="${QUAD_FONT_SIZE}" fill="white" stroke="black" stroke-width="2">${label}</text>`
        );
      }
    }
  }
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${FULL_W}" height="${FULL_H}" viewBox="0 0 ${FULL_W} ${FULL_H}">
  <g stroke="#fff" fill="none">${lines.join('')}</g>
  <g fill="white" stroke="black">${squareTexts.join('')}${quadTexts.join('')}</g>
</svg>`;
  const overlayInput = Buffer.from(svg);

  console.log('Compositing...');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const base = sharp({
    create: {
      width: FULL_W,
      height: FULL_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    },
    limitInputPixels: false,
    unlimited: true
  });

  const allComposites = [
    ...baseComposites,
    ...regionBordersComposites,
    ...regionNamesComposites,
    { input: overlayInput, left: 0, top: 0, limitInputPixels: false, unlimited: true }
  ];

  await base
    .composite(allComposites)
    .png()
    .toFile(outPath);

  const stats = fs.statSync(outPath);
  console.log(`Done. Written ${(stats.size / 1024 / 1024).toFixed(2)} MB → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
