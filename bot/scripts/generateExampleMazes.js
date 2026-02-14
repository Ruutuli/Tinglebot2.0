// ============================================================================
// Generate example grotto mazes: ASCII in console + PNG images (like maze-generator-master).
// Run from project root: node bot/scripts/generateExampleMazes.js
// Images are written to bot/scripts/example-mazes/ (created if needed).
// ============================================================================

const path = require('path');
const fs = require('fs');
const { generateGrottoMaze, getPathCellAt } = require(path.join(__dirname, '..', 'utils', 'grottoMazeGenerator.js'));

const WALL_SIZE = 10; // pixels per cell (same as maze-generator-master default)
const OUT_DIR = path.join(__dirname, 'example-mazes');

// Jimp uses 0xRRGGBBAA (red, green, blue, alpha)
const COLORS = {
  wall: 0x000000ff,
  background: 0xffffffff,
  start: 0xc0c0c0ff,   // light gray
  exit: 0x00aa00ff,    // green
  trap: 0xffff00ff,    // yellow
  chest: 0x0066ffff,   // blue
  mazep: 0xff3333ff,   // red
  mazen: 0xff6666ff,   // light red
  path: 0xffffffff,
};

const LEGEND = {
  start: 'S',
  exit: 'E',
  trap: 'T',
  chest: 'C',
  mazep: 'P',
  mazen: 'N',
  path: '.',
};

function cellChar(pathCells, x, y) {
  const cell = pathCells.find((c) => c.x === x && c.y === y);
  return cell ? (LEGEND[cell.type] || '.') : '.';
}

function pathCellColor(pathCells, x, y) {
  const cell = pathCells.find((c) => c.x === x && c.y === y);
  if (!cell) return COLORS.path;
  return COLORS[cell.type] ?? COLORS.path;
}

function mazeToAscii(maze) {
  const { matrix, pathCells } = maze;
  if (!matrix || !matrix.length) return '(empty matrix)';
  const rows = [];
  for (let y = 0; y < matrix.length; y++) {
    const row = matrix[y];
    let line = '';
    for (let x = 0; x < row.length; x++) {
      const isWall = row.charAt(x) === '1' || row[x] === 1;
      line += isWall ? '#' : cellChar(pathCells, x, y);
    }
    rows.push(line);
  }
  return rows.join('\n');
}

function printMaze(maze, title = 'Grotto maze') {
  console.log('\n' + '='.repeat(60));
  console.log(title);
  console.log('='.repeat(60));
  console.log(mazeToAscii(maze));
  console.log('\nLegend:  # = wall   S = start   E = exit   T = trap   C = chest   P = Mazep   N = MazeN   . = path');
  console.log('(Colors in PNG: green=exit, yellow=trap, blue=chest, red=Mazep/MazeN)');
}

/**
 * Render maze to a PNG image (like maze-generator-master). Each matrix cell = WALL_SIZE x WALL_SIZE pixels.
 */
async function mazeToImage(maze, wallSize = WALL_SIZE) {
  const Jimp = require('jimp');
  const { matrix, pathCells } = maze;
  if (!matrix || !matrix.length) throw new Error('Empty matrix');
  const cols = matrix[0].length;
  const rows = matrix.length;
  const w = cols * wallSize;
  const h = rows * wallSize;

  const image = await Jimp.create(w, h, COLORS.background);

  for (let y = 0; y < rows; y++) {
    const row = matrix[y];
    for (let x = 0; x < cols; x++) {
      const isWall = row.charAt(x) === '1' || row[x] === 1;
      const color = isWall ? COLORS.wall : pathCellColor(pathCells, x, y);
      for (let py = 0; py < wallSize; py++) {
        for (let px = 0; px < wallSize; px++) {
          image.setPixelColor(color, x * wallSize + px, y * wallSize + py);
        }
      }
    }
  }

  return image;
}

async function main() {
  console.log('Generating example grotto mazes...\n');

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log(`Created ${OUT_DIR}\n`);
  }

  const examples = [
    {
      name: 'small-8x8',
      title: 'Example 1: Small 8x8 maze (diagonal start/exit)',
      config: {
        width: 8,
        height: 8,
        entryType: 'diagonal',
        numTraps: 2,
        numChests: 1,
        numRed: 1,
      },
    },
    {
      name: 'default-12x12',
      title: 'Example 2: Default 12x12 maze (used in grotto trial)',
      config: {
        width: 12,
        height: 12,
        entryType: 'diagonal',
      },
    },
    {
      name: 'vertical-10x14',
      title: 'Example 3: Vertical 10x14 (top/bottom entries)',
      config: {
        width: 10,
        height: 14,
        entryType: 'vertical',
        bias: 'vertical',
        numTraps: 3,
        numChests: 2,
        numRed: 2,
      },
    },
  ];

  for (const ex of examples) {
    const maze = generateGrottoMaze(ex.config);
    printMaze(maze, ex.title);
    const image = await mazeToImage(maze);
    const outPath = path.join(OUT_DIR, `${ex.name}.png`);
    await image.writeAsync(outPath);
    console.log(`\nImage saved: ${outPath}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Done. PNGs are in bot/scripts/example-mazes/');
  console.log('Run again for different random layouts.');
  console.log('='.repeat(60) + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
