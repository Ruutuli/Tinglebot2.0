// mapModule.js

class MapModule {
    constructor() {
      this.columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']; // Full column range A to J
      this.rows = Array.from({ length: 12 }, (_, i) => i + 1); // Full row range 1 to 12
      this.quadrants = ['Q1', 'Q2', 'Q3', 'Q4'];
    }
  
    // Determine adjacent squares based on quadrant layout (must match dashboard/map: Q1=top-left, Q2=top-right, Q3=bottom-left, Q4=bottom-right; row increases south, col east).
    getAdjacentSquares(square, quadrant) {
        const [colIndex, rowIndex] = this.parseSquare(square);
        const adjacentSquares = [];

        const addSquare = (colIdx, rowIdx, quad, direction) => {
            if (colIdx >= 0 && colIdx < this.columns.length && rowIdx >= 1 && rowIdx <= 12) {
                const col = this.columns[colIdx];
                if (this.isValidSquare(col, rowIdx)) {
                    adjacentSquares.push({ square: `${col}${rowIdx}`, quadrant: quad, direction: direction || null });
                }
            }
        };

        // Quadrant layout (matches dashboard map-geometry and map-loader):
        //   Q1 | Q2   (top row)
        //   ---+---
        //   Q3 | Q4   (bottom row)
        const q = String(quadrant || '').trim().toUpperCase();
        switch (q) {
            case 'Q1':
                // Top-left: same square Q2 (right), Q3 (below), Q4 (diagonal); north = square above Q3,Q4; west = square left Q2,Q4; north-west = above-left Q4
                addSquare(colIndex, rowIndex, 'Q2', '→ East (same square)');
                addSquare(colIndex, rowIndex, 'Q3', '↓ South (same square)');
                addSquare(colIndex, rowIndex, 'Q4', '↘ South-east (same square)');
                addSquare(colIndex, rowIndex - 1, 'Q3', '↑ North');
                addSquare(colIndex, rowIndex - 1, 'Q4', '↑ North');
                addSquare(colIndex - 1, rowIndex, 'Q2', '← West');
                addSquare(colIndex - 1, rowIndex, 'Q4', '← West');
                addSquare(colIndex - 1, rowIndex - 1, 'Q4', '↖ North-west');
                break;
            case 'Q2':
                // Top-right: same square Q1, Q4, Q3; north = above Q3,Q4; east = right square Q1,Q3; north-east = above-right Q3
                addSquare(colIndex, rowIndex, 'Q1', '← West (same square)');
                addSquare(colIndex, rowIndex, 'Q4', '↓ South (same square)');
                addSquare(colIndex, rowIndex, 'Q3', '↙ South-west (same square)');
                addSquare(colIndex, rowIndex - 1, 'Q3', '↑ North');
                addSquare(colIndex, rowIndex - 1, 'Q4', '↑ North');
                addSquare(colIndex + 1, rowIndex, 'Q1', '→ East');
                addSquare(colIndex + 1, rowIndex, 'Q3', '→ East');
                addSquare(colIndex + 1, rowIndex - 1, 'Q3', '↗ North-east');
                break;
            case 'Q3':
                // Bottom-left: same square Q1, Q4, Q2; south = below Q1,Q2; west = left square Q2,Q4; south-west = below-left Q2
                addSquare(colIndex, rowIndex, 'Q1', '↑ North (same square)');
                addSquare(colIndex, rowIndex, 'Q4', '→ East (same square)');
                addSquare(colIndex, rowIndex, 'Q2', '↗ North-east (same square)');
                addSquare(colIndex, rowIndex + 1, 'Q1', '↓ South');
                addSquare(colIndex, rowIndex + 1, 'Q2', '↓ South');
                addSquare(colIndex - 1, rowIndex, 'Q2', '← West');
                addSquare(colIndex - 1, rowIndex, 'Q4', '← West');
                addSquare(colIndex - 1, rowIndex + 1, 'Q2', '↙ South-west');
                break;
            case 'Q4':
                // Bottom-right: same square Q2, Q3, Q1; south = below Q1,Q2; east = right square Q1,Q3; south-east = below-right Q1
                addSquare(colIndex, rowIndex, 'Q2', '↑ North (same square)');
                addSquare(colIndex, rowIndex, 'Q3', '← West (same square)');
                addSquare(colIndex, rowIndex, 'Q1', '↖ North-west (same square)');
                addSquare(colIndex, rowIndex + 1, 'Q1', '↓ South');
                addSquare(colIndex, rowIndex + 1, 'Q2', '↓ South');
                addSquare(colIndex + 1, rowIndex, 'Q1', '→ East');
                addSquare(colIndex + 1, rowIndex, 'Q3', '→ East');
                addSquare(colIndex + 1, rowIndex + 1, 'Q1', '↘ South-east');
                break;
            default:
                throw new Error('Invalid quadrant specified');
        }

        return adjacentSquares;
    }
    
   
  
    // Parse the square into column index and row number
    parseSquare(square) {
      const column = this.columns.indexOf(square.charAt(0));
      const row = parseInt(square.slice(1), 10);
      console.log(`Parsed square ${square}: Column - ${column}, Row - ${row}`);
      return [column, row];
    }
  
    // Validate if the square exists within the full A-J by 1-12 grid
    isValidSquare(column, row) {
      if (typeof column === 'string') {
        column = this.columns.indexOf(column);
      }
      const isValid = column >= 0 && column < this.columns.length && row >= 1 && row <= 12;
      console.log(`Square Validation - Column: ${column}, Row: ${row}, IsValid: ${isValid}`);
      return isValid;
    }
  }
  
  module.exports = MapModule;
  