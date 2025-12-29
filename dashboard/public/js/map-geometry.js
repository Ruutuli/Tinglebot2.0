/**
 * Map Geometry - Coordinate system and hit-testing utilities
 * Handles ID/index/bounds math, quadrant centers, and hit-testing
 */


class MapGeometry {
    constructor(config) {
        this.config = config;
        this.colToIndex = new Map();
        this.indexToCol = new Map();
        
        // Build column mapping
        config.GRID_COLS.forEach((col, index) => {
            this.colToIndex.set(col, index);
            this.indexToCol.set(index, col);
        });
        
        // Build row mapping (1-based to 0-based)
        this.rowToIndex = new Map();
        this.indexToRow = new Map();
        config.GRID_ROWS.forEach((row, index) => {
            this.rowToIndex.set(row, index);
            this.indexToRow.set(index, row);
        });
    }
    
    /**
     * Parse square ID (e.g., "E4") into column and row indices
     * @param {string} squareId - Square ID like "E4"
     * @returns {Object} {colIndex, rowIndex, col, row}
     */
    parseSquareId(squareId) {
        if (!squareId || typeof squareId !== 'string') {
            throw new Error(`Invalid square ID: ${squareId}`);
        }
        
        const match = squareId.match(/^([A-J])(\d+)$/);
        if (!match) {
            throw new Error(`Invalid square ID format: ${squareId}`);
        }
        
        const [, col, rowStr] = match;
        const row = parseInt(rowStr, 10);
        
        const colIndex = this.colToIndex.get(col);
        const rowIndex = this.rowToIndex.get(row);
        
        if (colIndex === undefined || rowIndex === undefined) {
            throw new Error(`Square ID out of bounds: ${squareId}`);
        }
        
        return { colIndex, rowIndex, col, row };
    }
    
    /**
     * Generate square ID from column and row indices
     * @param {number} colIndex - Column index (0-9)
     * @param {number} rowIndex - Row index (0-11)
     * @returns {string} Square ID like "E4"
     */
    generateSquareId(colIndex, rowIndex) {
        const col = this.indexToCol.get(colIndex);
        const row = this.indexToRow.get(rowIndex);
        
        if (!col || !row) {
            throw new Error(`Invalid indices: colIndex=${colIndex}, rowIndex=${rowIndex}`);
        }
        
        return `${col}${row}`;
    }
    
    /**
     * Get bounds for a square
     * @param {string} squareId - Square ID like "E4"
     * @returns {Object} {x0, y0, x1, y1}
     */
    getSquareBounds(squareId) {
        const { colIndex, rowIndex } = this.parseSquareId(squareId);
        
        const x0 = colIndex * this.config.SQUARE_W;
        const x1 = x0 + this.config.SQUARE_W;
        // A1 should be at top-left (0,0), so row 1 = y0=0, row 2 = y0=1666, etc.
        // rowIndex is 0-based, so row 1 has rowIndex=0, row 2 has rowIndex=1, etc.
        const y0 = rowIndex * this.config.SQUARE_H;
        const y1 = y0 + this.config.SQUARE_H;
        
        return { x0, y0, x1, y1 };
    }
    
    /**
     * Get bounds for a quadrant within a square
     * @param {string} squareId - Square ID like "E4"
     * @param {number} quadrant - Quadrant number (1-4)
     * @returns {Object} {x0, y0, x1, y1}
     */
    getQuadrantBounds(squareId, quadrant) {
        const squareBounds = this.getSquareBounds(squareId);
        const { SQUARE_W, SQUARE_H } = this.config;
        
        // Quadrant layout:
        // Q1 Q2
        // Q3 Q4
        const isRight = (quadrant === 2 || quadrant === 4);
        const isBottom = (quadrant === 3 || quadrant === 4);
        
        const x0 = squareBounds.x0 + (isRight ? SQUARE_W / 2 : 0);
        const x1 = x0 + SQUARE_W / 2;
        const y0 = squareBounds.y0 + (isBottom ? SQUARE_H / 2 : 0);
        const y1 = y0 + SQUARE_H / 2;
        
        return { x0, y0, x1, y1 };
    }
    
    /**
     * Get center point of a square
     * @param {string} squareId - Square ID like "E4"
     * @returns {Object} {x, y}
     */
    getSquareCenter(squareId) {
        const bounds = this.getSquareBounds(squareId);
        return {
            x: bounds.x0 + this.config.SQUARE_W / 2,
            y: bounds.y0 + this.config.SQUARE_H / 2
        };
    }
    
    /**
     * Get center point of a quadrant
     * @param {string} squareId - Square ID like "E4"
     * @param {number} quadrant - Quadrant number (1-4)
     * @returns {Object} {x, y}
     */
    getQuadrantCenter(squareId, quadrant) {
        const bounds = this.getQuadrantBounds(squareId, quadrant);
        return {
            x: bounds.x0 + this.config.QUADRANT_W / 2,
            y: bounds.y0 + this.config.QUADRANT_H / 2
        };
    }
    
    /**
     * Get corner position for a quadrant label
     * @param {string} squareId - Square ID like "E4"
     * @param {number} quadrant - Quadrant number (1-4)
     * @returns {Object} {x, y}
     */
    getQuadrantCorner(squareId, quadrant) {
        const bounds = this.getQuadrantBounds(squareId, quadrant);
        
        // Position labels in the corners of their quadrants:
        // Q1: top-left corner, Q2: top-right corner
        // Q3: bottom-left corner, Q4: bottom-right corner
        let cornerX, cornerY;
        
        switch (quadrant) {
            case 1: // Top-left
                cornerX = bounds.x0 + 60; // Much larger offset to prevent overlap
                cornerY = bounds.y0 + 60;
                break;
            case 2: // Top-right
                cornerX = bounds.x1 - 60;
                cornerY = bounds.y0 + 60;
                break;
            case 3: // Bottom-left
                cornerX = bounds.x0 + 60;
                cornerY = bounds.y1 - 60;
                break;
            case 4: // Bottom-right
                cornerX = bounds.x1 - 60;
                cornerY = bounds.y1 - 60;
                break;
            default:
                throw new Error(`Invalid quadrant: ${quadrant}`);
        }
        
        return { x: cornerX, y: cornerY };
    }
    
    /**
     * Hit-test a point to find the containing square
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {string|null} Square ID or null if outside bounds
     */
    hitTestSquare(x, y) {
        // Clamp to canvas bounds
        if (x < 0 || x >= this.config.CANVAS_W || y < 0 || y >= this.config.CANVAS_H) {
            return null;
        }
        
        const colIndex = Math.floor(x / this.config.SQUARE_W);
        const rowIndex = Math.floor(y / this.config.SQUARE_H);
        
        // Validate indices
        if (colIndex < 0 || colIndex >= this.config.GRID_COLS.length ||
            rowIndex < 0 || rowIndex >= this.config.GRID_ROWS.length) {
            return null;
        }
        
        return this.generateSquareId(colIndex, rowIndex);
    }
    
    /**
     * Hit-test a point to find the containing quadrant
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {Object|null} {squareId, quadrant} or null if outside bounds
     */
    hitTestQuadrant(x, y) {
        const squareId = this.hitTestSquare(x, y);
        if (!squareId) return null;
        
        const squareBounds = this.getSquareBounds(squareId);
        const relativeX = x - squareBounds.x0;
        const relativeY = y - squareBounds.y0;
        
        const isRight = relativeX >= this.config.SQUARE_W / 2;
        const isBottom = relativeY >= this.config.SQUARE_H / 2;
        
        let quadrant;
        if (!isRight && !isBottom) quadrant = 1;
        else if (isRight && !isBottom) quadrant = 2;
        else if (!isRight && isBottom) quadrant = 3;
        else quadrant = 4;
        
        return { squareId, quadrant };
    }
    
    /**
     * Get all squares that intersect with a bounding box
     * @param {Object} bounds - {x0, y0, x1, y1}
     * @returns {Array<string>} Array of square IDs
     */
    getSquaresInBounds(bounds) {
        const squares = new Set();
        
        // Convert bounds to grid indices
        const minColIndex = Math.max(0, Math.floor(bounds.x0 / this.config.SQUARE_W));
        const maxColIndex = Math.min(this.config.GRID_COLS.length - 1, Math.floor(bounds.x1 / this.config.SQUARE_W));
        const minRowIndex = Math.max(0, Math.floor(bounds.y0 / this.config.SQUARE_H));
        const maxRowIndex = Math.min(this.config.GRID_ROWS.length - 1, Math.floor(bounds.y1 / this.config.SQUARE_H));
        
        
        for (let colIndex = minColIndex; colIndex <= maxColIndex; colIndex++) {
            for (let rowIndex = minRowIndex; rowIndex <= maxRowIndex; rowIndex++) {
                squares.add(this.generateSquareId(colIndex, rowIndex));
            }
        }
        
        return Array.from(squares);
    }
    
    /**
     * Calculate distance from viewport center to square center
     * @param {string} squareId - Square ID
     * @param {Object} viewportCenter - {x, y}
     * @returns {number} Distance in pixels
     */
    getDistanceToViewport(squareId, viewportCenter) {
        const bounds = this.getSquareBounds(squareId);
        const squareCenter = {
            x: bounds.x0 + this.config.SQUARE_W / 2,
            y: bounds.y0 + this.config.SQUARE_H / 2
        };
        
        const dx = squareCenter.x - viewportCenter.x;
        const dy = squareCenter.y - viewportCenter.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    /**
     * Validate square ID format and bounds
     * @param {string} squareId - Square ID to validate
     * @returns {boolean} True if valid
     */
    isValidSquareId(squareId) {
        try {
            this.parseSquareId(squareId);
            return true;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * Get all valid square IDs
     * @returns {Array<string>} Array of all square IDs
     */
    getAllSquareIds() {
        const ids = [];
        for (let colIndex = 0; colIndex < this.config.GRID_COLS.length; colIndex++) {
            for (let rowIndex = 0; rowIndex < this.config.GRID_ROWS.length; rowIndex++) {
                ids.push(this.generateSquareId(colIndex, rowIndex));
            }
        }
        return ids;
    }
    
    /**
     * Get square metadata (status and region)
     * @param {string} squareId - Square ID like "E4"
     * @returns {Object|null} Square metadata or null if not found
     */
    getSquareMetadata(squareId) {
        // This will be populated by the MapEngine when metadata module is available
        if (this.metadata) {
            return this.metadata.getSquareMetadata(squareId);
        }
        return null;
    }
    
    /**
     * Check if a square is explorable
     * @param {string} squareId - Square ID like "E4"
     * @returns {boolean} True if square is explorable
     */
    isExplorable(squareId) {
        if (this.metadata) {
            return this.metadata.isExplorable(squareId);
        }
        return false;
    }
    
    /**
     * Check if a square is inaccessible
     * @param {string} squareId - Square ID like "E4"
     * @returns {boolean} True if square is inaccessible
     */
    isInaccessible(squareId) {
        if (this.metadata) {
            return this.metadata.isInaccessible(squareId);
        }
        return false;
    }
    
    /**
     * Get region for a square
     * @param {string} squareId - Square ID like "E4"
     * @returns {string|null} Region name or null if not found
     */
    getRegion(squareId) {
        if (this.metadata) {
            return this.metadata.getRegion(squareId);
        }
        return null;
    }
    
    /**
     * Get status for a square
     * @param {string} squareId - Square ID like "E4"
     * @returns {string|null} Status or null if not found
     */
    getStatus(squareId) {
        if (this.metadata) {
            return this.metadata.getStatus(squareId);
        }
        return null;
    }
    
    /**
     * Set metadata module reference
     * @param {MapMetadata} metadata - Metadata module instance
     */
    setMetadata(metadata) {
        this.metadata = metadata;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapGeometry;
}

