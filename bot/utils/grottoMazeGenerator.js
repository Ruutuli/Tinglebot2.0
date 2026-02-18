// ============================================================================
// Grotto Maze Generator — Node.js port of maze-generator-master for grotto trials
// Produces a maze layout with cell types: start, exit, trap, chest, mazep, mazen, path
// ============================================================================

// ----- Helpers (from maze-generator-master utils, no DOM) -----
function replaceAt(str, index, replacement) {
  if (index > str.length - 1) return str;
  return str.substr(0, index) + replacement + str.substr(index + 1);
}

function stringVal(str, index) {
  return parseInt(str.charAt(index), 10) || 0;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function getEntryNode(entries, type, gate = false) {
  if (!entries || !entries.start || !entries.end) return null;
  if (type === 'start') return gate ? entries.start.gate : { x: entries.start.x, y: entries.start.y };
  if (type === 'end') return gate ? entries.end.gate : { x: entries.end.x, y: entries.end.y };
  return null;
}

// ----- Maze generation (ported from maze.js) -----
const POSITION_INDEX = { n: 1, s: 2, w: 3, e: 4 };
const OPPOSITE_INDEX = { n: 2, s: 1, w: 4, e: 3 };

function generateNodes(width, height) {
  const count = width * height;
  const nodes = [];
  for (let i = 0; i < count; i++) nodes[i] = '01111';
  return nodes;
}

function getNeighbours(pos, width, height) {
  return {
    n: pos - width >= 0 ? pos - width : -1,
    s: pos + width < width * height ? pos + width : -1,
    w: pos > 0 && pos % width !== 0 ? pos - 1 : -1,
    e: (pos + 1) % width !== 0 ? pos + 1 : -1,
  };
}

function biasDirections(directions, bias) {
  const horizontal = directions.indexOf('w') !== -1 || directions.indexOf('e') !== -1;
  const vertical = directions.indexOf('n') !== -1 || directions.indexOf('s') !== -1;
  if (bias === 'horizontal' && horizontal) {
    return directions.filter((k) => k === 'w' || k === 'e');
  }
  if (bias === 'vertical' && vertical) {
    return directions.filter((k) => k === 'n' || k === 's');
  }
  return directions;
}

function parseMaze(nodes, width, height, bias) {
  const mazeSize = nodes.length;
  if (!mazeSize) return nodes;

  let moveNodes = [];
  let visited = 0;
  let position = Math.floor(Math.random() * nodes.length);

  let biasCount = 0;
  let biasFactor = 3;
  if (bias === 'horizontal') {
    biasFactor = width >= 100 ? Math.floor(width / 100) + 2 : 3;
  } else if (bias === 'vertical') {
    biasFactor = height >= 100 ? Math.floor(height / 100) + 2 : 3;
  }

  nodes[position] = replaceAt(nodes[position], 0, '1');

  while (visited < mazeSize - 1) {
    biasCount++;
    const next = getNeighbours(position, width, height);
    let directions = Object.keys(next).filter((key) => next[key] !== -1 && !stringVal(nodes[next[key]], 0));

    if (bias && biasCount !== biasFactor) {
      directions = biasDirections(directions, bias);
    } else {
      biasCount = 0;
    }

    if (directions.length) {
      visited++;
      if (directions.length > 1) moveNodes.push(position);
      const direction = directions[Math.floor(Math.random() * directions.length)];
      nodes[position] = replaceAt(nodes[position], POSITION_INDEX[direction], '0');
      position = next[direction];
      nodes[position] = replaceAt(nodes[position], OPPOSITE_INDEX[direction], '0');
      nodes[position] = replaceAt(nodes[position], 0, '1');
    } else {
      if (!moveNodes.length) break;
      position = moveNodes.pop();
    }
  }
  return nodes;
}

function getMatrix(nodes, width, height) {
  const mazeSize = width * height;
  const matrix = [];
  let row1 = '';
  let row2 = '';

  if (nodes.length !== mazeSize) return matrix;

  for (let i = 0; i < mazeSize; i++) {
    row1 += row1.length ? '' : '1';
    row2 += row2.length ? '' : '1';

    if (stringVal(nodes[i], 1)) {
      row1 += '11';
      row2 += stringVal(nodes[i], 4) ? '01' : '00';
    } else {
      const hasAbove = i - width >= 0;
      const above = hasAbove && stringVal(nodes[i - width], 4);
      const hasNext = i + 1 < mazeSize && (i + 1) % width !== 0;
      const next = hasNext && stringVal(nodes[i + 1], 1);
      if (stringVal(nodes[i], 4)) {
        row1 += '01';
        row2 += '01';
      } else if (next || above) {
        row1 += '01';
        row2 += '00';
      } else {
        row1 += '00';
        row2 += '00';
      }
    }

    if ((i + 1) % width === 0) {
      matrix.push(row1);
      matrix.push(row2);
      row1 = '';
      row2 = '';
    }
  }
  matrix.push('1'.repeat(width * 2 + 1));
  return matrix;
}

function getEntryNodes(entryType, width, height) {
  const y = (height * 2 + 1) - 2;
  const x = (width * 2 + 1) - 2;
  const entryNodes = {};

  if (entryType === 'diagonal') {
    entryNodes.start = { x: 1, y: 1, gate: { x: 0, y: 1 } };
    entryNodes.end = { x, y, gate: { x: x + 1, y } };
    return entryNodes;
  }

  if (entryType === 'horizontal' || entryType === 'vertical') {
    let xy = entryType === 'horizontal' ? y : x;
    xy = (xy - 1) / 2;
    const even = xy % 2 === 0;
    xy = even ? xy + 1 : xy;
    const start_x = entryType === 'horizontal' ? 1 : xy;
    const start_y = entryType === 'horizontal' ? xy : 1;
    const end_x = entryType === 'horizontal' ? x : (even ? start_x : start_x + 2);
    const end_y = entryType === 'horizontal' ? (even ? start_y : start_y + 2) : y;
    const startgate = entryType === 'horizontal' ? { x: 0, y: start_y } : { x: start_x, y: 0 };
    const endgate = entryType === 'horizontal' ? { x: x + 1, y: end_y } : { x: end_x, y: y + 1 };
    entryNodes.start = { x: start_x, y: start_y, gate: startgate };
    entryNodes.end = { x: end_x, y: end_y, gate: endgate };
  }
  return entryNodes;
}

function removeWall(matrix, row, index) {
  const evenRow = row % 2 === 0;
  const evenIndex = index % 2 === 0;
  if (!stringVal(matrix[row], index)) return false;

  if (!evenRow && evenIndex) {
    const hasTop = row - 2 > 0 && stringVal(matrix[row - 2], index) === 1;
    const hasBottom = row + 2 < matrix.length && stringVal(matrix[row + 2], index) === 1;
    if (hasTop && hasBottom) {
      matrix[row] = replaceAt(matrix[row], index, '0');
      return true;
    }
    if (!hasTop && hasBottom) {
      const left = stringVal(matrix[row - 1], index - 1) === 1;
      const right = stringVal(matrix[row - 1], index + 1) === 1;
      if (left || right) {
        matrix[row] = replaceAt(matrix[row], index, '0');
        return true;
      }
    }
    if (!hasBottom && hasTop) {
      const left = stringVal(matrix[row + 1], index - 1) === 1;
      const right = stringVal(matrix[row + 1], index + 1) === 1;
      if (left || right) {
        matrix[row] = replaceAt(matrix[row], index, '0');
        return true;
      }
    }
  } else if (evenRow && !evenIndex) {
    const hasLeft = stringVal(matrix[row], index - 2) === 1;
    const hasRight = stringVal(matrix[row], index + 2) === 1;
    if (hasLeft && hasRight) {
      matrix[row] = replaceAt(matrix[row], index, '0');
      return true;
    }
    if (!hasLeft && hasRight) {
      const top = stringVal(matrix[row - 1], index - 1) === 1;
      const bottom = stringVal(matrix[row + 1], index - 1) === 1;
      if (top || bottom) {
        matrix[row] = replaceAt(matrix[row], index, '0');
        return true;
      }
    }
    if (!hasRight && hasLeft) {
      const top = stringVal(matrix[row - 1], index + 1) === 1;
      const bottom = stringVal(matrix[row + 1], index + 1) === 1;
      if (top || bottom) {
        matrix[row] = replaceAt(matrix[row], index, '0');
        return true;
      }
    }
  }
  return false;
}

function removeMazeWalls(matrix, removeWalls, maxTries = 300) {
  if (!removeWalls || !matrix.length) return;
  const min = 1;
  const max = matrix.length - 1;
  let wallsRemoved = 0;
  let tries = 0;

  while (tries < maxTries && wallsRemoved < removeWalls) {
    tries++;
    let y = Math.floor(Math.random() * (max - min + 1)) + min;
    if (y === max) y--;
    const row = matrix[y];
    const walls = [];
    for (let i = 1; i < row.length - 1; i++) {
      if (stringVal(row, i)) walls.push(i);
    }
    shuffleArray(walls);
    for (let i = 0; i < walls.length; i++) {
      if (removeWall(matrix, y, walls[i])) {
        wallsRemoved++;
        break;
      }
    }
  }
}

// ----- Build path cells and assign grotto cell types -----
const CELL_TYPES = ['start', 'exit', 'trap', 'chest', 'mazep', 'mazen', 'path'];

function collectPathCells(matrix, entryNodes) {
  const start = getEntryNode(entryNodes, 'start');
  const end = getEntryNode(entryNodes, 'end');
  if (!start || !end) return [];

  const cells = [];
  for (let y = 0; y < matrix.length; y++) {
    const row = matrix[y];
    for (let x = 0; x < row.length; x++) {
      if (stringVal(row, x) !== 0) continue;
      const key = `${x},${y}`;
      if (x === start.x && y === start.y) {
        cells.push({ x, y, type: 'start', key });
      } else if (x === end.x && y === end.y) {
        cells.push({ x, y, type: 'exit', key });
      } else {
        cells.push({ x, y, type: 'path', key });
      }
    }
  }
  return cells;
}

function assignGrottoCellTypes(pathCells, options = {}) {
  const pathOnly = pathCells.filter((c) => c.type === 'path');
  if (pathOnly.length === 0) return pathCells;

  const numTraps = Math.min(options.numTraps ?? (2 + Math.floor(Math.random() * 3)), pathOnly.length);
  const numChests = Math.min(options.numChests ?? (2 + Math.floor(Math.random() * 3)), pathOnly.length);
  const numRed = Math.min(options.numRed ?? 1, pathOnly.length);

  shuffleArray(pathOnly);

  let idx = 0;
  for (let i = 0; i < numTraps && idx < pathOnly.length; i++, idx++) {
    pathOnly[idx].type = 'trap';
  }
  for (let i = 0; i < numChests && idx < pathOnly.length; i++, idx++) {
    pathOnly[idx].type = 'chest';
  }
  for (let i = 0; i < numRed && idx < pathOnly.length; i++, idx++) {
    pathOnly[idx].type = Math.random() < 0.5 ? 'mazep' : 'mazen';
  }

  return pathCells;
}

/**
 * Generate a grotto maze layout.
 * @param {Object} config
 * @param {number} [config.width=12] - logical width (cells)
 * @param {number} [config.height=12] - logical height (cells)
 * @param {string} [config.entryType='diagonal'] - 'diagonal' | 'horizontal' | 'vertical'
 * @param {string} [config.bias=''] - '' | 'horizontal' | 'vertical'
 * @param {number} [config.removeWalls=0] - extra walls to remove
 * @param {number} [config.numTraps] - 2–4 random if omitted
 * @param {number} [config.numChests] - 2–4 random if omitted
 * @param {number} [config.numRed=1] - one mazep or mazen if omitted
 * @returns {Object} { matrix, width, height, entryNodes, pathCells }
 */
function generateGrottoMaze(config = {}) {
  const width = Math.max(3, Math.min(50, parseInt(config.width, 10) || 12));
  const height = Math.max(3, Math.min(50, parseInt(config.height, 10) || 12));
  const entryType = config.entryType || 'diagonal';
  const bias = config.bias || '';
  const removeWalls = Math.max(0, Math.min(300, parseInt(config.removeWalls, 10) || 0));

  const entryNodes = getEntryNodes(entryType, width, height);
  let nodes = generateNodes(width, height);
  nodes = parseMaze(nodes, width, height, bias);
  const matrix = getMatrix(nodes, width, height);
  if (!matrix.length) {
    return { matrix: [], width, height, entryNodes, pathCells: [] };
  }

  removeMazeWalls(matrix, removeWalls);

  let pathCells = collectPathCells(matrix, entryNodes);
  pathCells = assignGrottoCellTypes(pathCells, {
    numTraps: config.numTraps,
    numChests: config.numChests,
    numRed: config.numRed,
  });

  return {
    matrix,
    width,
    height,
    entryNodes,
    pathCells,
  };
}

/**
 * Get path cell at (x, y) from pathCells array.
 */
function getPathCellAt(pathCells, x, y) {
  const key = `${x},${y}`;
  return pathCells.find((c) => c.x === x && c.y === y) || pathCells.find((c) => c.key === key);
}

// Facing: n/s/e/w. One step = ±1 in matrix (one adjacent cell per move).
function moveInFacing(x, y, facing) {
  switch (facing) {
    case 'n': return { x, y: y - 1 };
    case 's': return { x, y: y + 1 };
    case 'e': return { x: x + 1, y };
    case 'w': return { x: x - 1, y };
    default: return { x, y };
  }
}

const ROTATE_LEFT = { n: 'w', w: 's', s: 'e', e: 'n' };
const ROTATE_RIGHT = { n: 'e', e: 's', s: 'w', w: 'n' };
const OPPOSITE_FACING = { n: 's', s: 'n', e: 'w', w: 'e' };

/**
 * Resolve movement from (x,y) with current facing. Action: left | right | straight | back.
 * Returns { nextX, nextY, newFacing } or null if blocked or invalid.
 * One step = one adjacent cell.
 */
function getNeighbourCoordsWithFacing(matrix, x, y, facing, action) {
  let newFacing = facing;
  if (action === 'left') newFacing = ROTATE_LEFT[facing] || 'n';
  else if (action === 'right') newFacing = ROTATE_RIGHT[facing] || 'n';
  else if (action === 'back') newFacing = OPPOSITE_FACING[facing] || 's';

  const next = moveInFacing(x, y, newFacing);
  if (!isWalkable(matrix, next.x, next.y)) return null;
  return { x: next.x, y: next.y, facing: newFacing };
}

const CARDINAL_MOVE = {
  north: { dx: 0, dy: -1, facing: 'n' },
  n: { dx: 0, dy: -1, facing: 'n' },
  south: { dx: 0, dy: 1, facing: 's' },
  s: { dx: 0, dy: 1, facing: 's' },
  east: { dx: 1, dy: 0, facing: 'e' },
  e: { dx: 1, dy: 0, facing: 'e' },
  west: { dx: -1, dy: 0, facing: 'w' },
  w: { dx: -1, dy: 0, facing: 'w' },
};

/** Check if (x,y) is in bounds and walkable (0). Walls (1) or out-of-bounds return false. */
function isWalkable(matrix, x, y) {
  if (!matrix || y < 0 || y >= matrix.length) return false;
  const row = matrix[y];
  if (!row || x < 0 || x >= row.length) return false;
  return stringVal(row, x) === 0;
}

/**
 * Get the walkable cell on the "other side" of a wall when standing at (x,y) facing a direction.
 * Tries adjacent cell first; if it's a wall, tries one more step. Returns { x, y } or null.
 */
function getCellBeyondWall(matrix, x, y, facing) {
  if (!matrix || isNaN(x) || isNaN(y)) return null;
  const step1 = moveInFacing(x, y, facing);
  if (isWalkable(matrix, step1.x, step1.y)) return { x: step1.x, y: step1.y };
  const step2 = moveInFacing(step1.x, step1.y, facing);
  if (isWalkable(matrix, step2.x, step2.y)) return { x: step2.x, y: step2.y };
  return null;
}

/**
 * Get neighbouring path cell. Direction can be:
 * - Cardinal: north, south, east, west (or n, s, e, w) — absolute direction
 * - Relative: left, right, straight, back — uses current facing
 *
 * One move = one adjacent cell (±1). Destination must be walkable (path, not wall).
 */
function getNeighbourCoords(matrix, x, y, direction, facing) {
  const card = CARDINAL_MOVE[direction?.toLowerCase()];
  if (card) {
    const next = { x: x + card.dx, y: y + card.dy };
    if (!isWalkable(matrix, next.x, next.y)) return null;
    return { x: next.x, y: next.y, facing: card.facing };
  }
  const defFacing = facing || 's';
  const result = getNeighbourCoordsWithFacing(matrix, x, y, defFacing, direction);
  return result ? { x: result.x, y: result.y, facing: result.facing } : null;
}

module.exports = {
  generateGrottoMaze,
  getPathCellAt,
  getNeighbourCoords,
  getNeighbourCoordsWithFacing,
  getEntryNode,
  moveInFacing,
  getCellBeyondWall,
  CELL_TYPES,
};
