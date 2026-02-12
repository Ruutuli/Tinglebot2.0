/**
 * Map Manifest - Load and validate squares.json manifest
 * Single source of truth for square metadata and available layers
 */


class MapManifest {
    constructor(config, geometry) {
        this.config = config;
        this.geometry = geometry;
        this.manifest = null;
        this.loadPromise = null;
    }
    
    /**
     * Load the manifest from the server
     * @returns {Promise<Object>} Manifest data
     */
    async load() {
        if (this.loadPromise) {
            return this.loadPromise;
        }
        
        this.loadPromise = this._loadManifest();
        return this.loadPromise;
    }
    
    async _loadManifest() {
        try {
            // Loading squares.json from local fallback...
            
            // Use local fallback directly - simpler and no CORS issues
            const manifest = await this._loadFromFallback();
            
            if (!manifest) {
                throw new Error('Failed to load manifest from fallback');
            }
            
            this._validateManifest(manifest);
            this.manifest = manifest;
            
            // Loaded successfully
            return manifest;
        } catch (error) {
            console.error('[manifest] Failed to load:', error);
            throw error;
        }
    }
    
    
    async _loadFromFallback() {
        try {
            const fallbackUrl = this.config.getFallbackManifestURL();
            // Attempting fallback URL
            
            const response = await fetch(fallbackUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                }
            });
            
            if (!response.ok) {
                throw new Error(`Fallback request failed: ${response.status} ${response.statusText}`);
            }
            
            const manifest = await response.json();
            // Successfully loaded from fallback
            return manifest;
        } catch (error) {
            console.warn('[manifest] Fallback load failed:', error.message);
            return null;
        }
    }
    
    /**
     * Validate manifest structure
     * @param {Object} manifest - Manifest data to validate
     */
    _validateManifest(manifest) {
        const requiredFields = ['grid', 'squareSize', 'canvas', 'squares'];
        
        for (const field of requiredFields) {
            if (!(field in manifest)) {
                throw new Error(`Manifest missing required field: ${field}`);
            }
        }
        
        // Validate grid structure
        const { grid } = manifest;
        if (!Array.isArray(grid.cols) || !Array.isArray(grid.rows)) {
            throw new Error('Grid cols and rows must be arrays');
        }
        
        if (grid.cols.length !== this.config.GRID_COLS.length || 
            grid.rows.length !== this.config.GRID_ROWS.length) {
            throw new Error('Grid dimensions do not match config');
        }
        
        // Validate square size
        const { squareSize } = manifest;
        if (squareSize.w !== this.config.SQUARE_W || squareSize.h !== this.config.SQUARE_H) {
            throw new Error('Square size does not match config');
        }
        
        // Validate canvas size
        const { canvas } = manifest;
        if (canvas.w !== this.config.CANVAS_W || canvas.h !== this.config.CANVAS_H) {
            throw new Error('Canvas size does not match config');
        }
        
        // Validate squares data
        const { squares } = manifest;
        if (typeof squares !== 'object') {
            throw new Error('Squares must be an object');
        }
        
        // Validate each square
        const expectedSquares = this.geometry.getAllSquareIds();
        for (const squareId of expectedSquares) {
            if (!(squareId in squares)) {
                throw new Error(`Square ${squareId} missing from manifest`);
            }
            
            const square = squares[squareId];
            this._validateSquare(squareId, square);
        }
        
        // Validation passed
    }
    
    /**
     * Validate individual square data
     * @param {string} squareId - Square ID
     * @param {Object} square - Square data
     */
    _validateSquare(squareId, square) {
        const requiredFields = ['bounds', 'layers'];
        
        for (const field of requiredFields) {
            if (!(field in square)) {
                throw new Error(`Square ${squareId} missing field: ${field}`);
            }
        }
        
        // Validate bounds
        const { bounds } = square;
        const expectedBounds = this.geometry.getSquareBounds(squareId);
        
        if (bounds.x0 !== expectedBounds.x0 || bounds.y0 !== expectedBounds.y0 ||
            bounds.x1 !== expectedBounds.x1 || bounds.y1 !== expectedBounds.y1) {
            throw new Error(`Square ${squareId} bounds do not match expected values`);
        }
        
        // Validate layers
        const { layers } = square;
        if (!Array.isArray(layers)) {
            throw new Error(`Square ${squareId} layers must be an array`);
        }
        
        // Validate hasPreview if present
        if ('hasPreview' in square && typeof square.hasPreview !== 'boolean') {
            throw new Error(`Square ${squareId} hasPreview must be boolean`);
        }
    }
    
    /**
     * Get square data by ID
     * @param {string} squareId - Square ID
     * @returns {Object|null} Square data or null if not found
     */
    getSquare(squareId) {
        if (!this.manifest) {
            throw new Error('Manifest not loaded');
        }
        
        return this.manifest.squares[squareId] || null;
    }
    
    /**
     * Get all squares that intersect with viewport bounds
     * @param {Object} bounds - {x0, y0, x1, y1}
     * @returns {Array<Object>} Array of square data with IDs
     */
    getSquaresInViewport(bounds) {
        if (!this.manifest) {
            throw new Error('Manifest not loaded');
        }
        
        const squareIds = this.geometry.getSquaresInBounds(bounds);
        return squareIds.map(squareId => ({
            id: squareId,
            ...this.manifest.squares[squareId]
        }));
    }
    
    /**
     * Get available layers for a square
     * @param {string} squareId - Square ID
     * @returns {Array<string>} Array of layer names
     */
    listLayersForSquare(squareId) {
        const square = this.getSquare(squareId);
        return square ? square.layers : [];
    }
    
    /**
     * Check if a square has preview images
     * @param {string} squareId - Square ID
     * @returns {boolean} True if preview images available
     */
    hasPreview(squareId) {
        const square = this.getSquare(squareId);
        return square ? (square.hasPreview === true) : false;
    }
    
    /**
     * Get manifest metadata
     * @returns {Object} Manifest metadata
     */
    getMetadata() {
        if (!this.manifest) {
            throw new Error('Manifest not loaded');
        }
        
        return {
            grid: this.manifest.grid,
            squareSize: this.manifest.squareSize,
            canvas: this.manifest.canvas,
            totalSquares: Object.keys(this.manifest.squares).length
        };
    }
    
    /**
     * Get all available layer types across all squares
     * @returns {Set<string>} Set of unique layer names
     */
    getAllLayerTypes() {
        if (!this.manifest) {
            throw new Error('Manifest not loaded');
        }
        
        const layerTypes = new Set();
        for (const squareId of Object.keys(this.manifest.squares)) {
            const layers = this.manifest.squares[squareId].layers;
            layers.forEach(layer => layerTypes.add(layer));
        }
        
        return layerTypes;
    }
    
    /**
     * Check if manifest is loaded
     * @returns {boolean} True if loaded
     */
    isLoaded() {
        return this.manifest !== null;
    }
    
    /**
     * Get loading progress (for UI feedback)
     * @returns {Object} {loaded: boolean, progress: number}
     */
    getLoadingProgress() {
        return {
            loaded: this.isLoaded(),
            progress: this.isLoaded() ? 1.0 : 0.0
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapManifest;
}

