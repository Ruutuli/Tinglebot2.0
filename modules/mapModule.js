const { handleError } = require('../utils/globalErrorHandler');

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
    
        switch (quadrant) {
            case 'Q1':
                // H6 Q1 connections
                addSquare(colIndex, rowIndex, 'Q2'); // H6 Q2
                addSquare(colIndex, rowIndex, 'Q3'); // H6 Q3
                addSquare(colIndex, rowIndex, 'Q4'); // H6 Q4
                addSquare(colIndex, rowIndex + 1, 'Q2'); // H7 Q2
                addSquare(colIndex, rowIndex + 1, 'Q4'); // H7 Q4
                addSquare(colIndex - 1, rowIndex + 1, 'Q4'); // G7 Q4
                addSquare(colIndex - 1, rowIndex, 'Q3'); // G6 Q3
                addSquare(colIndex - 1, rowIndex, 'Q4'); // G6 Q4
                break;
            case 'Q2':
                // H6 Q2 connections
                addSquare(colIndex, rowIndex, 'Q1'); // H6 Q1
                addSquare(colIndex, rowIndex, 'Q3'); // H6 Q3
                addSquare(colIndex, rowIndex, 'Q4'); // H6 Q4
                addSquare(colIndex - 1, rowIndex, 'Q3'); // G6 Q3
                addSquare(colIndex - 1, rowIndex, 'Q4'); // G6 Q4
                addSquare(colIndex - 1, rowIndex - 1, 'Q3'); // G5 Q3
                addSquare(colIndex, rowIndex - 1, 'Q1'); // H5 Q1
                addSquare(colIndex, rowIndex - 1, 'Q3'); // H5 Q3
                break;
            case 'Q3':
                // H6 Q3 connections
                addSquare(colIndex, rowIndex, 'Q2'); // H6 Q2
                addSquare(colIndex, rowIndex, 'Q1'); // H6 Q1
                addSquare(colIndex, rowIndex, 'Q4'); // H6 Q4
                addSquare(colIndex, rowIndex + 1, 'Q4'); // H7 Q4
                addSquare(colIndex, rowIndex + 1, 'Q2'); // H7 Q2
                addSquare(colIndex + 1, rowIndex + 1, 'Q2'); // I7 Q2
                addSquare(colIndex + 1, rowIndex, 'Q1'); // I6 Q1
                addSquare(colIndex + 1, rowIndex, 'Q2'); // I6 Q2
                break;
            case 'Q4':
                // H6 Q4 connections
                addSquare(colIndex, rowIndex, 'Q2'); // H6 Q2
                addSquare(colIndex, rowIndex, 'Q3'); // H6 Q3
                addSquare(colIndex, rowIndex, 'Q1'); // H6 Q1
                addSquare(colIndex + 1, rowIndex, 'Q1'); // I6 Q1
                addSquare(colIndex + 1, rowIndex, 'Q2'); // I6 Q2
                addSquare(colIndex + 1, rowIndex - 1, 'Q1'); // I5 Q1
                addSquare(colIndex, rowIndex - 1, 'Q1'); // H5 Q1
                addSquare(colIndex, rowIndex - 1, 'Q3'); // H5 Q3
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
  