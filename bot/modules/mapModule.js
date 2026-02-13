// mapModule.js

class MapModule {
    constructor() {
      this.columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']; // Full column range A to J
      this.rows = Array.from({ length: 12 }, (_, i) => i + 1); // Full row range 1 to 12
      this.quadrants = ['Q1', 'Q2', 'Q3', 'Q4'];
    }
  
    // Determine adjacent squares based on quadrant layout and full grid setup
    getAdjacentSquares(square, quadrant) {
        const [colIndex, rowIndex] = this.parseSquare(square);
        const adjacentSquares = [];
    
        const addSquare = (colIdx, rowIdx, quad) => {
            if (colIdx >= 0 && colIdx < this.columns.length && rowIdx >= 1 && rowIdx <= 12) {
                const col = this.columns[colIdx];
                if (this.isValidSquare(col, rowIdx)) {
                    adjacentSquares.push({ square: `${col}${rowIdx}`, quadrant: quad });
                }
            }
        };
    
        // Quadrant layout (row increases south, col increases east):
        //   Q4 | Q3   (north row)
        //   ---+---
        //   Q2 | Q1   (south row)
        switch (quadrant) {
            case 'Q1':
                // Same square: Q2 (west), Q3 (north), Q4 (north-west)
                addSquare(colIndex, rowIndex, 'Q2');
                addSquare(colIndex, rowIndex, 'Q3');
                addSquare(colIndex, rowIndex, 'Q4');
                // East (col+1)
                addSquare(colIndex + 1, rowIndex, 'Q2');
                addSquare(colIndex + 1, rowIndex, 'Q4');
                // South (row+1)
                addSquare(colIndex, rowIndex + 1, 'Q3');
                addSquare(colIndex, rowIndex + 1, 'Q4');
                // South-east (col+1, row+1)
                addSquare(colIndex + 1, rowIndex + 1, 'Q4');
                break;
            case 'Q2':
                // Same square: Q1 (east), Q3 (north-east), Q4 (north)
                addSquare(colIndex, rowIndex, 'Q1');
                addSquare(colIndex, rowIndex, 'Q3');
                addSquare(colIndex, rowIndex, 'Q4');
                // North (row-1): H7 Q4, H7 Q3
                addSquare(colIndex, rowIndex - 1, 'Q4');
                addSquare(colIndex, rowIndex - 1, 'Q3');
                // East (col+1): I8 Q1, I8 Q3
                addSquare(colIndex + 1, rowIndex, 'Q1');
                addSquare(colIndex + 1, rowIndex, 'Q3');
                // North-east (col+1, row-1): I7 Q3
                addSquare(colIndex + 1, rowIndex - 1, 'Q3');
                break;
            case 'Q3':
                // Same square: Q1 (south), Q2 (south-west), Q4 (west)
                addSquare(colIndex, rowIndex, 'Q1');
                addSquare(colIndex, rowIndex, 'Q2');
                addSquare(colIndex, rowIndex, 'Q4');
                // North (row-1)
                addSquare(colIndex, rowIndex - 1, 'Q1');
                addSquare(colIndex, rowIndex - 1, 'Q2');
                // East (col+1)
                addSquare(colIndex + 1, rowIndex, 'Q4');
                addSquare(colIndex + 1, rowIndex, 'Q1');
                // North-east (col+1, row-1)
                addSquare(colIndex + 1, rowIndex - 1, 'Q1');
                break;
            case 'Q4':
                // Same square: Q1 (south-east), Q2 (south), Q3 (east)
                addSquare(colIndex, rowIndex, 'Q1');
                addSquare(colIndex, rowIndex, 'Q2');
                addSquare(colIndex, rowIndex, 'Q3');
                // North (row-1)
                addSquare(colIndex, rowIndex - 1, 'Q2');
                addSquare(colIndex, rowIndex - 1, 'Q1');
                // West (col-1)
                addSquare(colIndex - 1, rowIndex, 'Q3');
                addSquare(colIndex - 1, rowIndex, 'Q1');
                // North-west (col-1, row-1)
                addSquare(colIndex - 1, rowIndex - 1, 'Q1');
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
  