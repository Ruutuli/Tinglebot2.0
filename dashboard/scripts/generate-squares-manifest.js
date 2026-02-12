const fs = require("fs");
const path = require("path");

const GRID_COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const GRID_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const SQUARE_W = 2400;
const SQUARE_H = 1666;

const LAYERS = [
  "background",
  "base",
  "blight",
  "mask",
  "region-borders",
  "paths",
  "village-borders-inner",
  "village-borders-outer",
  "village-markers",
  "region-names",
  "MAP_0003s_0000_PSL",
  "MAP_0003s_0001_LDW",
  "MAP_0003s_0002_Other-Paths",
];

const squares = {};
for (let r = 0; r < GRID_ROWS.length; r++) {
  for (let c = 0; c < GRID_COLS.length; c++) {
    const squareId = GRID_COLS[c] + GRID_ROWS[r];
    const x0 = c * SQUARE_W;
    const y0 = r * SQUARE_H;
    squares[squareId] = {
      bounds: { x0, y0, x1: x0 + SQUARE_W, y1: y0 + SQUARE_H },
      layers: [...LAYERS],
      hasPreview: true,
    };
  }
}

const manifest = {
  grid: { cols: GRID_COLS, rows: GRID_ROWS },
  squareSize: { w: SQUARE_W, h: SQUARE_H },
  canvas: { w: 24000, h: 20000 },
  squares,
};

const outPath = path.join(__dirname, "..", "public", "manifest", "squares.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), "utf8");
console.log("Wrote", outPath);
