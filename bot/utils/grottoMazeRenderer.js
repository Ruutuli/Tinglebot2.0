// ============================================================================
// Grotto Maze Renderer — Renders maze layout to PNG buffer for Discord embeds
// View modes: 'member' = fog of war (only explored sections visible) | 'mod' = full with solution & you are here
// ============================================================================

const WALL_SIZE = 15;
// Fog of war: maze divided into grids. Only start grid visible at first; moving reveals new grids (they stay revealed).
// Section count scales with maze size: 6x6 maze (13x13 matrix) → 4x4 grids; 12x12 maze (25x25) → 6x6 grids

const COLORS = {
  wall: 0x000000ff,
  background: 0xffffffff,
  fog: 0x0a0a0aff,
  start: 0x8b6914ff, // brown to match 🟫 Entrance
  exit: 0x00aa00ff,
  trap: 0xffff00ff,
  chest: 0x0066ffff,
  mazep: 0xff3333ff,
  mazen: 0xff6666ff,
  path: 0xffffffff,
  youAreHere: 0xff8800ff,
  solution: 0x90ee90ff,
  usedX: 0x333333ff, // dark gray for X on used trap/chest/wall
};

function stringVal(row, x) {
  if (!row || x < 0 || x >= row.length) return 1;
  return parseInt(row.charAt ? row.charAt(x) : String(row[x]), 10) || 0;
}

/** BFS from start to exit; returns Set of "x,y" keys on the solution path. */
function getSolutionPath(matrix, pathCells) {
  const start = pathCells?.find((c) => c.type === "start");
  const exit = pathCells?.find((c) => c.type === "exit");
  if (!start || !exit || !matrix?.length) return new Set();
  const rows = matrix.length;
  const cols = matrix[0]?.length || 0;
  const walkable = (x, y) => {
    if (y < 0 || y >= rows || x < 0 || x >= cols) return false;
    return stringVal(matrix[y], x) === 0;
  };
  const key = (x, y) => `${x},${y}`;
  const queue = [{ x: start.x, y: start.y }];
  const visited = new Set([key(start.x, start.y)]);
  const parent = new Map();
  while (queue.length > 0) {
    const { x, y } = queue.shift();
    if (x === exit.x && y === exit.y) {
      const path = new Set();
      let cur = { x, y };
      while (cur) {
        path.add(key(cur.x, cur.y));
        cur = parent.get(key(cur.x, cur.y));
      }
      return path;
    }
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (walkable(nx, ny) && !visited.has(k)) {
        visited.add(k);
        parent.set(k, { x, y });
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return new Set();
}

const SPECIAL_CELL_TYPES = ["chest", "trap", "mazep", "mazen"];

function pathCellColor(pathCells, currentNode, solutionPath, viewMode, x, y, openedChests, triggeredTraps, usedScryingWalls) {
  const k = `${x},${y}`;
  const isMod = viewMode === "mod";
  if (!pathCells || !Array.isArray(pathCells)) return { color: COLORS.path, drawX: false, onSolutionPath: false };
  const cell = pathCells.find((c) => c.x === x && c.y === y);
  if (!cell) return { color: COLORS.path, drawX: false, onSolutionPath: false };

  const isCurrentCell = currentNode && currentNode.x === x && currentNode.y === y;
  const isSpecialCell = SPECIAL_CELL_TYPES.includes(cell.type);
  const isChestUsed = cell.type === "chest" && openedChests.has(k);
  const isTrapUsed = cell.type === "trap" && triggeredTraps.has(k);
  const isWallUsed = (cell.type === "mazep" || cell.type === "mazen") && usedScryingWalls.has(k);
  const isUsed = isChestUsed || isTrapUsed || isWallUsed;
  const _onSolutionPath = isMod && solutionPath && solutionPath.has(k) && cell.type !== "start" && cell.type !== "exit";

  if (viewMode === "member") {
    if (cell.type === "start") return { color: COLORS.start, drawX: false, onSolutionPath: false };
    if (cell.type === "exit") return { color: COLORS.exit, drawX: false, onSolutionPath: false };
    if (isUsed) {
      const baseColor = cell.type === "chest" ? COLORS.chest : cell.type === "trap" ? COLORS.trap : (COLORS[cell.type] ?? COLORS.mazep);
      return { color: baseColor, drawX: true, onSolutionPath: false };
    }
    if (cell.type === "chest") return { color: COLORS.chest, drawX: false, onSolutionPath: false };
    if (cell.type === "trap") return { color: COLORS.trap, drawX: false, onSolutionPath: false };
    if (cell.type === "mazep" || cell.type === "mazen") return { color: COLORS[cell.type] ?? COLORS.mazep, drawX: false, onSolutionPath: false };
    if (isCurrentCell && !isSpecialCell) return { color: COLORS.youAreHere, drawX: false, onSolutionPath: false };
    return { color: COLORS.path, drawX: false, onSolutionPath: false };
  }

  if (isMod && isCurrentCell && !isSpecialCell) return { color: COLORS.youAreHere, drawX: false, onSolutionPath: _onSolutionPath };
  if (isMod && isUsed) {
    const baseColor = cell.type === "chest" ? COLORS.chest : cell.type === "trap" ? COLORS.trap : (COLORS[cell.type] ?? COLORS.mazep);
    return { color: baseColor, drawX: true, onSolutionPath: _onSolutionPath };
  }

  if (isMod && _onSolutionPath && !isSpecialCell) return { color: COLORS.solution, drawX: false, onSolutionPath: true };
  if (isMod && isSpecialCell) return { color: COLORS[cell.type] ?? COLORS.mazep, drawX: false, onSolutionPath: _onSolutionPath };
  return { color: COLORS.path, drawX: false, onSolutionPath: false };
}

/**
 * Parses currentNode (string "x,y" or {x,y}) into {x,y} or null.
 */
function parseCurrentNode(currentNode) {
  if (!currentNode) return null;
  if (typeof currentNode === "object" && "x" in currentNode && "y" in currentNode) return currentNode;
  const parts = String(currentNode).split(",").map((n) => parseInt(n, 10));
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return { x: parts[0], y: parts[1] };
  return null;
}

function getFogSectionCount(cols, rows) {
  const dim = Math.min(cols, rows);
  return Math.max(3, Math.min(6, Math.ceil(dim / 4)));
}

function getSectionForCell(x, y, cols, rows, sectionCount) {
  const n = sectionCount ?? getFogSectionCount(cols, rows);
  const sx = Math.min(n - 1, Math.floor((x / Math.max(1, cols)) * n));
  const sy = Math.min(n - 1, Math.floor((y / Math.max(1, rows)) * n));
  return { sx, sy };
}

function getRevealedSections(layout, visitedCells, currentNode) {
  const revealed = new Set();
  const pathCells = layout?.pathCells;
  const cols = layout?.matrix?.[0]?.length ?? 1;
  const rows = layout?.matrix?.length ?? 1;
  const n = getFogSectionCount(cols, rows);
  const start = pathCells?.find((c) => c.type === "start");
  if (start) {
    const { sx, sy } = getSectionForCell(start.x, start.y, cols, rows, n);
    revealed.add(`${sx},${sy}`);
  }
  for (const key of visitedCells || []) {
    const [x, y] = String(key).split(",").map((v) => parseInt(v, 10));
    if (!isNaN(x) && !isNaN(y)) {
      const { sx, sy } = getSectionForCell(x, y, cols, rows, n);
      revealed.add(`${sx},${sy}`);
    }
  }
  if (currentNode && typeof currentNode.x === "number" && typeof currentNode.y === "number") {
    const { sx, sy } = getSectionForCell(currentNode.x, currentNode.y, cols, rows, n);
    revealed.add(`${sx},${sy}`);
  }
  return revealed;
}

function isInRevealedSection(x, y, revealedSections, cols, rows) {
  const n = getFogSectionCount(cols, rows);
  const { sx, sy } = getSectionForCell(x, y, cols, rows, n);
  return revealedSections.has(`${sx},${sy}`);
}

/**
 * Renders a grotto maze layout to a PNG buffer.
 * @param {Object} layout - grotto.mazeState.layout with { matrix, pathCells }
 * @param {number|Object} [optionsOrWallSize=15] - Wall size (number) or { currentNode, wallSize, viewMode, visitedCells }
 * @param {string} [optionsOrWallSize.viewMode='member'] - 'member' (fog of war) | 'mod' (full map)
 * @param {string[]} [optionsOrWallSize.visitedCells] - For member: explored cells; unrevealed sections stay black
 * @param {string[]} [optionsOrWallSize.openedChests] - Cell keys 'x,y' already opened
 * @param {string[]} [optionsOrWallSize.triggeredTraps] - Cell keys 'x,y' already triggered
 * @param {string[]} [optionsOrWallSize.usedScryingWalls] - Cell keys 'x,y' where Song of Scrying was used
 * @returns {Promise<Buffer>} PNG buffer suitable for Discord attachment
 */
async function renderMazeToBuffer(layout, optionsOrWallSize = 15) {
  const Jimp = require("jimp");
  const opts = typeof optionsOrWallSize === "number" ? { wallSize: optionsOrWallSize } : optionsOrWallSize;
  const wallSize = opts.wallSize ?? 15;
  const viewMode = opts.viewMode === "mod" ? "mod" : "member";
  const currentNode = parseCurrentNode(opts.currentNode);
  const solutionPath = viewMode === "mod" ? getSolutionPath(layout?.matrix, layout?.pathCells) : null;
  const openedChests = new Set(opts.openedChests || []);
  const triggeredTraps = new Set(opts.triggeredTraps || []);
  const usedScryingWalls = new Set(opts.usedScryingWalls || []);

  const { matrix, pathCells } = layout || {};
  if (!matrix || !matrix.length) throw new Error("Empty maze matrix");
  const cols = matrix[0].length;
  const rows = matrix.length;
  const w = cols * wallSize;
  const h = rows * wallSize;

  const useFogOfWar = viewMode === "member";
  const revealedSections = useFogOfWar ? getRevealedSections(layout, opts.visitedCells, currentNode) : null;

  const image = await Jimp.create(w, h, useFogOfWar ? COLORS.fog : COLORS.background);

  const isCurrentCellPixel = (cellX, cellY) =>
    currentNode && currentNode.x === cellX && currentNode.y === cellY;

  const radius = Math.floor(wallSize / 2) - 1;
  const cx = Math.floor(wallSize / 2);
  const cy = Math.floor(wallSize / 2);

  for (let y = 0; y < rows; y++) {
    const row = matrix[y];
    for (let x = 0; x < cols; x++) {
      const inRevealed = !useFogOfWar || isInRevealedSection(x, y, revealedSections, cols, rows);
      if (!inRevealed) {
        for (let py = 0; py < wallSize; py++) {
          for (let px = 0; px < wallSize; px++) {
            image.setPixelColor(COLORS.fog, x * wallSize + px, y * wallSize + py);
          }
        }
        continue;
      }
      const isWall = stringVal(row, x) === 1;
      const cellInfo = isWall ? { color: COLORS.wall, drawX: false, onSolutionPath: false } : pathCellColor(pathCells, currentNode, solutionPath, viewMode, x, y, openedChests, triggeredTraps, usedScryingWalls);
      const color = cellInfo.color;
      const drawCircle = !isWall && isCurrentCellPixel(x, y);
      const drawX = !isWall && cellInfo.drawX;
      const drawSolutionBorder = !isWall && cellInfo.onSolutionPath && cellInfo.color !== COLORS.solution;

      const isOnX = (px, py) => {
        const thickness = 2;
        return Math.abs(px - py) <= thickness || Math.abs(px + py - (wallSize - 1)) <= thickness;
      };
      const isOnSolutionBorder = (px, py) => {
        const inset = 2;
        return (px >= inset && px <= wallSize - 1 - inset && (py === inset || py === wallSize - 1 - inset)) ||
          (py >= inset && py <= wallSize - 1 - inset && (px === inset || px === wallSize - 1 - inset));
      };

      for (let py = 0; py < wallSize; py++) {
        for (let px = 0; px < wallSize; px++) {
          const gx = x * wallSize + px;
          const gy = y * wallSize + py;
          let pixelColor = color;
          if (drawCircle) {
            const dx = px - cx;
            const dy = py - cy;
            const inCircle = dx * dx + dy * dy <= radius * radius;
            pixelColor = inCircle ? COLORS.youAreHere : color;
          }
          if (drawSolutionBorder && isOnSolutionBorder(px, py)) pixelColor = COLORS.solution;
          if (drawX && isOnX(px, py)) {
            pixelColor = COLORS.usedX;
          }
          image.setPixelColor(pixelColor, gx, gy);
        }
      }
    }
  }

  return image.getBufferAsync(Jimp.MIME_PNG);
}

module.exports = { renderMazeToBuffer };
