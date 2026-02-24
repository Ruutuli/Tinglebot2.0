/**
 * Map Loader - Viewport-based loading with batching and prioritization
 * Handles fast-first (preview→full) loading from Google Cloud Storage
 */


class MapLoader {
    constructor(config, geometry, manifest, layers, metadata) {
        this.config = config;
        this.geometry = geometry;
        this.manifest = manifest;
        this.layers = layers;
        this.metadata = metadata || null;
        
        // Loading state
        this.loadingQueue = [];
        this.loadingSet = new Set();
        this.loadedSquares = new Set();
        this.cache = new Map(); // LRU cache for loaded squares
        this.previewCache = new Map(); // Cache for preview images
        this.debounceTimer = null;
        this._imageLoadInFlight = 0;
        this._imageLoadQueue = [];
        
        // Performance tracking
        this.loadStartTime = 0;
        this.batchStartTime = 0;
        
        // Current viewport state
        this.currentViewport = null;
        this.currentZoom = 1;
        this.currentVisibleSquares = new Set();
    }
    
    /**
     * Initialize the loader
     */
    initialize() {
        // Initialized
    }
    
    /**
     * Update viewport and trigger loading (debounced)
     * @param {Object} bounds - Viewport bounds {x0, y0, x1, y1}
     * @param {number} zoom - Current zoom level
     */
    updateViewport(bounds, zoom) {
        this.currentViewport = bounds;
        this.currentZoom = zoom;
        
        // Debounce rapid viewport changes
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = setTimeout(() => {
            this._processViewportChange();
        }, this.config.DEBOUNCE_MS);
    }
    
    /**
     * Process viewport change and update loading
     */
    _processViewportChange() {
        if (!this.currentViewport || !this.manifest.isLoaded()) {
            return;
        }
        
        const targetSquares = this._calculateTargetSquares();
        const squaresToLoad = this._prioritizeSquares(targetSquares);
        
        // Viewport update processed
        
        this._updateLoadingQueue(squaresToLoad);
        this._processLoadingQueue();
        
        // Update labels for all visible squares (regardless of loading status)
        this._updateAllVisibleLabels();
    }
    
    /**
     * Calculate target squares based on viewport + buffer
     * @returns {Array<string>} Array of square IDs to load
     */
    _calculateTargetSquares() {
        const buffer = this.config.BUFFER_SQUARES * this.config.SQUARE_W;
        const bufferedBounds = {
            x0: Math.max(0, this.currentViewport.x0 - buffer),
            y0: Math.max(0, this.currentViewport.y0 - buffer),
            x1: this.currentViewport.x1 + buffer,
            y1: this.currentViewport.y1 + buffer
        };
        
        const squares = this.geometry.getSquaresInBounds(bufferedBounds);
        
        // Debug logging removed for performance
        
        return squares;
    }
    
    /**
     * Prioritize squares by distance to viewport center
     * @param {Array<string>} squareIds - Square IDs to prioritize
     * @returns {Array<string>} Prioritized square IDs
     */
    _prioritizeSquares(squareIds) {
        const viewportCenter = {
            x: (this.currentViewport.x0 + this.currentViewport.x1) / 2,
            y: (this.currentViewport.y0 + this.currentViewport.y1) / 2
        };
        
        return squareIds
            .map(squareId => ({
                id: squareId,
                distance: this.geometry.getDistanceToViewport(squareId, viewportCenter)
            }))
            .sort((a, b) => a.distance - b.distance)
            .map(item => item.id);
    }
    
    /**
     * Update loading queue based on target squares
     * @param {Array<string>} targetSquares - Squares that should be loaded
     */
    _updateLoadingQueue(targetSquares) {
        const targetSet = new Set(targetSquares);
        
        // Remove squares that are no longer needed
        this._unloadUnneededSquares(targetSet);
        
        // Add new squares to queue
        for (const squareId of targetSquares) {
            if (!this.loadedSquares.has(squareId) && !this.loadingSet.has(squareId)) {
                this.loadingQueue.push(squareId);
                this.loadingSet.add(squareId);
            }
        }
        
        // Update cache if needed
        this._manageCache();
    }
    
    /**
     * Unload squares that are no longer needed
     * @param {Set<string>} targetSet - Set of squares that should remain loaded
     */
    _unloadUnneededSquares(targetSet) {
        const toUnload = [];
        
        for (const squareId of this.loadedSquares) {
            if (!targetSet.has(squareId)) {
                toUnload.push(squareId);
            }
        }
        
        for (const squareId of toUnload) {
            this._unloadSquare(squareId);
        }
    }
    
    /**
     * Manage cache size (LRU eviction)
     */
    _manageCache() {
        if (this.loadedSquares.size <= this.config.CACHE_SQUARES_SOFTCAP) {
            return;
        }
        
        const toEvict = this.loadedSquares.size - this.config.CACHE_SQUARES_SOFTCAP;
        const evicted = [];
        
        // Simple LRU: remove oldest loaded squares
        for (const squareId of this.loadedSquares) {
            if (evicted.length >= toEvict) break;
            
            // Don't evict squares currently in viewport
            if (!this._isSquareInCurrentViewport(squareId)) {
                evicted.push(squareId);
            }
        }
        
        for (const squareId of evicted) {
            this._unloadSquare(squareId);
        }
        
        // Cache evicted
    }
    
    /**
     * Check if square is in current viewport
     * @param {string} squareId - Square ID
     * @returns {boolean} True if in viewport
     */
    _isSquareInCurrentViewport(squareId) {
        if (!this.currentViewport) return false;
        
        const bounds = this.geometry.getSquareBounds(squareId);
        
        return !(bounds.x1 < this.currentViewport.x0 ||
                bounds.x0 > this.currentViewport.x1 ||
                bounds.y1 < this.currentViewport.y0 ||
                bounds.y0 > this.currentViewport.y1);
    }
    
    /**
     * Process loading queue in batches
     */
    async _processLoadingQueue() {
        if (this.loadingQueue.length === 0) {
            return;
        }
        
        const batch = this.loadingQueue.splice(0, this.config.BATCH_SIZE);
        this.batchStartTime = performance.now();
        
        // Processing batch
        
        // Process batch in parallel
        const promises = batch.map(squareId => this._loadSquare(squareId));
        
        try {
            await Promise.allSettled(promises);
            const batchTime = performance.now() - this.batchStartTime;
            
            // Process next batch if queue has more items
            if (this.loadingQueue.length > 0) {
                // Use requestIdleCallback if available, otherwise setTimeout
                if (window.requestIdleCallback) {
                    requestIdleCallback(() => this._processLoadingQueue());
                } else {
                    setTimeout(() => this._processLoadingQueue(), 16);
                }
            }
        } catch (error) {
            console.error('[loader] Batch processing error:', error);
        }
    }
    
    /**
     * Load a single square
     * @param {string} squareId - Square ID to load
     */
    async _loadSquare(squareId) {
        const loadStartTime = performance.now();
        
        try {
            const square = this.manifest.getSquare(squareId);
            if (!square) {
                throw new Error(`Square ${squareId} not found in manifest`);
            }
            
            const layers = this.manifest.listLayersForSquare(squareId);
            // No preview images in GCS – always load full-resolution tiles
            const usePreview = false;
            
            
            // Load layers in priority order (fog first, then blight, then base, then region borders, then village markers)
            let layersToLoad = [];
            
            // Add hidden areas layer first (fog layer) only if square has unexplored/inaccessible quadrants
            // Skip fog when all 4 quadrants are explored or secured (from DB metadata)
            const shouldShowFog = this._shouldShowFogForSquare(squareId, layers);
            if (shouldShowFog) {
                layersToLoad.push('MAP_0001_hidden-areas');
            }
            
            // Add blight layer (above base layer)
            // Only load blight for squares that actually have blight images
            if (this._shouldHaveBlight(squareId)) {
                layersToLoad.push('MAP_0000_BLIGHT');
            }
            
            // Then add base layer
            if (layers.includes('MAP_0002_Map-Base')) {
                layersToLoad.push('MAP_0002_Map-Base');
            }
            // Otherwise, convert old "base" layer to new format
            else if (layers.includes('base')) {
                layersToLoad.push('MAP_0002_Map-Base');
            }
            
            // Add region borders layer when manifest lists it for this square
            if (layers.includes('MAP_0001s_0003_Region-Borders') || layers.includes('region-borders')) {
                layersToLoad.push('MAP_0001s_0003_Region-Borders');
            }
            // Add region names layer (only for squares that have region name images)
            if (this._shouldHaveRegionNames(squareId)) {
                layersToLoad.push('MAP_0001s_0004_REGIONS-NAMES');
            }
            // Add village circle layers only for squares that have those assets (avoids 404s in console)
            const villageCircleLayers = this._getVillageCircleLayersForSquare(squareId, layers);
            layersToLoad.push(...villageCircleLayers);

            // Add village marker layers (appear above village borders)
            const villageMarkerLayers = layers.filter(layer => 
                layer.startsWith('MAP_0001s_') && layer.includes('-Marker')
            );
            layersToLoad.push(...villageMarkerLayers);
            
            // Add path layers (appear above base, below village markers)
            // Only load paths for squares that actually have path images
            const pathLayersForSquare = this._getPathLayersForSquare(squareId);
            layersToLoad.push(...pathLayersForSquare);
            
            // Load layers with proper ordering to ensure fog loads before base
            await this._loadLayersInOrder(squareId, layersToLoad, usePreview);
            
            // Add labels if zoom level is appropriate
            this._updateLabelsForSquare(squareId);
            
            // Mark as loaded (store loadedLayerNames so unload removes by actual layer group names)
            this.loadedSquares.add(squareId);
            this.cache.set(squareId, {
                layers: layers,
                loadedLayerNames: layersToLoad.slice(),
                hasPreview: false,
                loadedAt: Date.now()
            });
            
            const loadTime = performance.now() - loadStartTime;
            
            // Square loaded
            
        } catch (error) {
            console.error('[loader] Failed to load square:', squareId, error);
        } finally {
            this.loadingSet.delete(squareId);
        }
    }
    
    /**
     * Whether to show the fog/hidden-areas layer for this square (when at least one quadrant is unexplored/inaccessible).
     * @param {string} squareId - Square ID
     * @param {Array<string>} layers - Layer list from manifest
     * @returns {boolean}
     */
    _shouldShowFogForSquare(squareId, layers) {
        if (!(layers.includes('MAP_0001_hidden-areas') || layers.includes('mask'))) {
            return false;
        }
        if (!this.metadata || typeof this.metadata.getQuadrants !== 'function') {
            return true;
        }
        const quadrants = this.metadata.getQuadrants(squareId);
        if (!quadrants || quadrants.length !== 4) {
            return true;
        }
        const anyUnexploredOrInaccessible = quadrants.some(function (q) {
            const s = (q.status || '').toLowerCase();
            return s === 'unexplored' || s === 'inaccessible';
        });
        return anyUnexploredOrInaccessible;
    }

    /**
     * Get quadrant numbers (1-4) that should show fog (unexplored or inaccessible). Used for per-quadrant clip-path.
     * Layout: Q1 Q2 / Q3 Q4 (top-left, top-right, bottom-left, bottom-right).
     * @param {string} squareId - Square ID
     * @returns {Array<number>} e.g. [1, 3] for left column only
     */
    _getFogQuadrants(squareId) {
        const out = [];
        if (!this.metadata || typeof this.metadata.getQuadrants !== 'function') {
            return [1, 2, 3, 4];
        }
        const quadrants = this.metadata.getQuadrants(squareId);
        if (!quadrants || quadrants.length !== 4) {
            return [1, 2, 3, 4];
        }
        quadrants.forEach(function (q) {
            const id = (q.quadrantId || '').toUpperCase();
            const num = id === 'Q1' ? 1 : id === 'Q2' ? 2 : id === 'Q3' ? 3 : id === 'Q4' ? 4 : 0;
            if (num && ((q.status || '').toLowerCase() === 'unexplored' || (q.status || '').toLowerCase() === 'inaccessible')) {
                out.push(num);
            }
        });
        return out.length ? out : [1, 2, 3, 4];
    }

    /**
     * Check if a square should have region names. Disabled so names don't cover map content.
     * @param {string} squareId - Square ID to check
     * @returns {boolean} Whether the square should have region names
     */
    _shouldHaveRegionNames(squareId) {
        return false;
    }
    
    /**
     * Check if a square has Region-Borders image in GCS (avoids 404s).
     * Add square IDs here when the asset exists in GCS.
     * @param {string} squareId - Square ID to check
     * @returns {boolean} Whether to load Region-Borders for this square
     */
    _shouldHaveRegionBorders(squareId) {
        const regionBordersSquares = [];
        return regionBordersSquares.includes(squareId);
    }
    
    /**
     * Get the specific path layers that should be loaded for a square
     * @param {string} squareId - Square ID to check
     * @returns {Array<string>} Array of path layer names to load
     */
    _getPathLayersForSquare(squareId) {
        const pathLayers = [];
        
        // PSL (Path of Scarlet Leaves) squares
        const pslSquares = ['G6', 'H5', 'H6', 'H7', 'H8'];
        if (pslSquares.includes(squareId)) {
            pathLayers.push('MAP_0003s_0000_PSL');
        }
        
        // LDW (Leaf Dew Way) squares
        const ldwSquares = ['F10', 'F11', 'F9', 'G10', 'G11', 'G8', 'G9', 'H10', 'H11', 'H8', 'H9'];
        if (ldwSquares.includes(squareId)) {
            pathLayers.push('MAP_0003s_0001_LDW');
        }
        
        // Other-Paths squares
        const otherPathsSquares = ['H4', 'H5', 'H7', 'H8', 'I8'];
        if (otherPathsSquares.includes(squareId)) {
            pathLayers.push('MAP_0003s_0002_Other-Paths');
        }
        
        return pathLayers;
    }
    
    /**
     * Get village circle layers only for squares that have those assets (avoids 404s).
     * @param {string} squareId - Square ID to check
     * @param {Array<string>} layers - Manifest layers for this square
     * @returns {Array<string>} Village circle layer names to load
     */
    _getVillageCircleLayersForSquare(squareId, layers) {
        const hasVillageBordersLegacy = layers.includes('village-borders-inner') || layers.includes('village-borders-outer');
        if (!hasVillageBordersLegacy) {
            return layers.filter(layer => layer.startsWith('MAP_0002s_') && layer.includes('CIRCLE-'));
        }
        // Only request circle layers for squares that have the assets (prevents 404s in console)
        const inarikoSquares = ['G8', 'H8'];
        const vhintlSquares = ['F9', 'F10'];
        const rudaniaSquares = ['H5'];
        const circleLayers = [];
        if (inarikoSquares.includes(squareId)) {
            circleLayers.push('MAP_0002s_0000s_0000_CIRCLE-INARIKO-CYAN', 'MAP_0002s_0000s_0001_CIRCLE-INARIKO-PINK');
        }
        if (vhintlSquares.includes(squareId)) {
            circleLayers.push('MAP_0002s_0001s_0000_CIRCLE-VHINTL-CYAN', 'MAP_0002s_0001s_0001_CIRCLE-VHINTL-PINK');
        }
        if (rudaniaSquares.includes(squareId)) {
            circleLayers.push('MAP_0002s_0002s_0000_CIRCLE-RUDANIA-CYAN', 'MAP_0002s_0002s_0001_CIRCLE-RUDANIA-PINK');
        }
        return circleLayers;
    }
    
    /**
     * Check if a square should have blight based on the specific squares that have blight images
     * @param {string} squareId - Square ID to check
     * @returns {boolean} Whether the square should have blight
     */
    _shouldHaveBlight(squareId) {
        // These are the specific squares that have blight images
        const blightSquares = [
            'A10', 'A11', 'A12', 'A8', 'A9',
            'B10', 'B11', 'B12', 'B6', 'B7', 'B8', 'B9',
            'C10', 'C11', 'C12', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9',
            'D10', 'D11', 'D12', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9',
            'E1', 'E10', 'E11', 'E12', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9',
            'F1', 'F10', 'F11', 'F12', 'F2', 'F3', 'F5', 'F6', 'F7', 'F8', 'F9',
            'G1', 'G11', 'G12', 'G2', 'G3', 'G6', 'G7', 'G8', 'G9',
            'H1', 'H10', 'H11', 'H2', 'H3', 'H6', 'H7', 'H8', 'H9',
            'I1', 'I10', 'I11', 'I12', 'I2', 'I3', 'I4', 'I5', 'I9',
            'J1', 'J10', 'J2', 'J3', 'J4', 'J5', 'J9'
        ];
        return blightSquares.includes(squareId);
    }
    
    /**
     * Load layers: critical first (fog, blight, base), then deferred (borders, village, paths) on idle
     * @param {string} squareId - Square ID
     * @param {Array<string>} layersToLoad - Array of layer names to load
     * @param {boolean} usePreview - Whether to use preview images
     */
    async _loadLayersInOrder(squareId, layersToLoad, usePreview) {
        const fogLayer = layersToLoad.find(layer => layer === 'MAP_0001_hidden-areas');
        const blightLayer = layersToLoad.find(layer => layer === 'MAP_0000_BLIGHT');
        const regionBordersLayer = layersToLoad.find(layer => layer === 'MAP_0001s_0003_Region-Borders');
        const otherLayers = layersToLoad.filter(layer =>
            layer !== 'MAP_0001_hidden-areas' &&
            layer !== 'MAP_0000_BLIGHT' &&
            layer !== 'MAP_0001s_0003_Region-Borders'
        );

        const baseLayer = 'MAP_0002_Map-Base';
        const criticalLayers = otherLayers.filter(l => l === baseLayer);
        const deferredLayers = otherLayers.filter(l => l !== baseLayer);
        if (regionBordersLayer) deferredLayers.push(regionBordersLayer);

        // Critical: fog, blight, base (so map is usable quickly)
        if (fogLayer) await this._loadSquareLayer(squareId, fogLayer, usePreview);
        if (blightLayer) await this._loadSquareLayer(squareId, blightLayer, usePreview);
        await Promise.all(criticalLayers.map(layerName => this._loadSquareLayer(squareId, layerName, usePreview)));

        // Deferred: borders, village markers, paths (when browser is idle)
        if (deferredLayers.length > 0) {
            const loadDeferred = () => {
                if (!this.loadedSquares.has(squareId)) return;
                Promise.all(deferredLayers.map(layerName => this._loadSquareLayer(squareId, layerName, usePreview))).catch(() => {});
            };
            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(loadDeferred, { timeout: 500 });
            } else {
                setTimeout(loadDeferred, 0);
            }
        }
    }

    /**
     * Load a single layer for a square
     * @param {string} squareId - Square ID
     * @param {string} layerName - Layer name
     * @param {boolean} usePreview - Whether to use preview image
     */
    async _loadSquareLayer(squareId, layerName, usePreview) {
        const imageUrl = this._getImageUrl(squareId, layerName, usePreview);
        const options = (layerName === 'MAP_0001_hidden-areas')
            ? { fogQuadrants: this._getFogQuadrants(squareId) }
            : undefined;
        try {
            if (this._isLayerLoaded(squareId, layerName, usePreview)) return;
            await this._preloadImage(imageUrl);
            if (!this.loadedSquares.has(squareId) && !this.loadingSet.has(squareId)) return;
            this.layers.addRasterOverlay(squareId, layerName, imageUrl, usePreview, options);
        } catch (error) {
            if (usePreview) {
                try {
                    if (this._isLayerLoaded(squareId, layerName, false)) return;
                    const fullUrl = this._getImageUrl(squareId, layerName, false);
                    await this._preloadImage(fullUrl);
                    if (!this.loadedSquares.has(squareId) && !this.loadingSet.has(squareId)) return;
                    this.layers.addRasterOverlay(squareId, layerName, fullUrl, false, options);
                    return;
                } catch (_) { /* fallback failed, warn below */ }
            }
            if (!this._isOptionalLayer(layerName)) {
                console.warn('[loader] Failed to load image:', { squareId, layerName, imageUrl, error: error.message });
            }
        }
    }

    /**
     * Layers that may not exist for every square (village circles, borders, region names).
     * Missing images for these are not warned to avoid console noise.
     */
    _isOptionalLayer(layerName) {
        return layerName.includes('CIRCLE-') ||
            layerName === 'MAP_0001s_0003_Region-Borders' ||
            layerName === 'MAP_0001s_0004_REGIONS-NAMES';
    }
    
    /**
     * Get image URL for a square and layer from Google Cloud Storage
     * @param {string} squareId - Square ID
     * @param {string} layerName - Layer name
     * @param {boolean} isPreview - Whether to get preview URL
     * @returns {string} GCS Image URL
     */
    _getImageUrl(squareId, layerName, isPreview) {
        // Path image (draw path on map) replaces BASE only for this square when set
        if (layerName === 'MAP_0002_Map-Base' && typeof window !== 'undefined' && window.__pathImageBaseOverrides && window.__pathImageBaseOverrides[squareId]) {
            return window.__pathImageBaseOverrides[squareId];
        }
        return this.config.getGCSImageURL(squareId, layerName, isPreview);
    }
    
    /**
     * Preload an image from GCS (with concurrency cap to avoid connection saturation).
     * Uses fetch first when the image may not exist (preview or optional layers), so 404s
     * don't trigger browser Image console errors.
     * @param {string} url - Image URL (GCS)
     * @returns {Promise<HTMLImageElement>} Loaded image
     */
    _preloadImage(url) {
        const isPreview = url.includes('_preview');
        const isOptionalLayer = url.includes('CIRCLE-') || url.includes('Region-Borders') || url.includes('REGIONS-NAMES');
        const useFetchFirst = isPreview || isOptionalLayer;
        const maxConcurrent = this.config.MAX_CONCURRENT_IMAGE_LOADS || 8;
        return new Promise((resolve, reject) => {
            const run = () => {
                this._imageLoadInFlight++;
                const done = () => {
                    this._imageLoadInFlight--;
                    if (this._imageLoadQueue.length > 0) {
                        const next = this._imageLoadQueue.shift();
                        next();
                    }
                };
                const loadFromUrl = (srcUrl) => {
                    const img = new Image();
                    img.onload = () => { resolve(img); done(); };
                    img.onerror = () => { reject(new Error(`Failed to load image: ${url}`)); done(); };
                    img.src = srcUrl;
                };
                if (useFetchFirst) {
                    fetch(url, { method: 'GET' })
                        .then((res) => {
                            if (!res.ok) {
                                done();
                                reject(new Error(`Failed to load image: ${url}`));
                                return;
                            }
                            return res.blob();
                        })
                        .then((blob) => {
                            if (!blob) return;
                            const objectUrl = URL.createObjectURL(blob);
                            const img = new Image();
                            img.onload = () => {
                                URL.revokeObjectURL(objectUrl);
                                resolve(img);
                                done();
                            };
                            img.onerror = () => {
                                URL.revokeObjectURL(objectUrl);
                                reject(new Error(`Failed to load image: ${url}`));
                                done();
                            };
                            img.src = objectUrl;
                        })
                        .catch((err) => {
                            done();
                            reject(err);
                        });
                } else {
                    loadFromUrl(url);
                }
            };
            if (this._imageLoadInFlight < maxConcurrent) {
                run();
            } else {
                this._imageLoadQueue.push(run);
            }
        });
    }
    
    /**
     * Check if layer is already loaded
     * @param {string} squareId - Square ID
     * @param {string} layerName - Layer name
     * @param {boolean} isPreview - Whether checking for preview
     * @returns {boolean} True if loaded
     */
    _isLayerLoaded(squareId, layerName, isPreview) {
        const layerGroup = this.layers.layerGroups.get(layerName);
        if (!layerGroup) return false;
        
        const key = `${squareId}-${layerName}`;
        let found = false;
        
        layerGroup.eachLayer(overlay => {
            if (overlay._mapKey === key && overlay._isPreview === isPreview) {
                found = true;
                return; // Exit early since we found the overlay
            }
        });
        
        return found;
    }
    
    /**
     * Update labels for a square based on current zoom
     * @param {string} squareId - Square ID
     */
    _updateLabelsForSquare(squareId) {
        // Remove existing labels
        this.layers.removeLabels(squareId);
        
        // Add square label if zoom level is appropriate
        if (this.currentZoom >= this.config.LABEL_ZOOM_SQUARES) {
            this.layers.addSquareLabel(squareId);
        }
        
        // Add quadrant labels if zoom level is appropriate
        if (this.currentZoom >= this.config.LABEL_ZOOM_QUADS) {
            this.layers.addQuadrantLabels(squareId);
        }
    }
    
    /**
     * Update labels for all squares in viewport (regardless of loading status)
     */
    _updateAllVisibleLabels() {
        const targetSquares = this._calculateTargetSquares();
        const targetSet = new Set(targetSquares);
        
        
        // Get currently visible squares (from previous update)
        const currentVisibleSquares = this.currentVisibleSquares || new Set();
        
        // Remove labels for squares that are no longer visible
        for (const squareId of currentVisibleSquares) {
            if (!targetSet.has(squareId)) {
                // Debug logging removed for performance
                this.layers.removeLabels(squareId);
            }
        }
        
        // Add labels for new visible squares if zoom level is appropriate
        for (const squareId of targetSquares) {
            if (!currentVisibleSquares.has(squareId)) {
                if (this.currentZoom >= this.config.LABEL_ZOOM_SQUARES) {
                    this.layers.addSquareLabel(squareId);
                }
                
                if (this.currentZoom >= this.config.LABEL_ZOOM_QUADS) {
                    this.layers.addQuadrantLabels(squareId);
                }
            }
        }
        
        // Update current visible squares
        this.currentVisibleSquares = targetSet;
    }
    
    /**
     * Unload a square
     * @param {string} squareId - Square ID to unload
     */
    _unloadSquare(squareId) {
        const cached = this.cache.get(squareId);
        if (!cached) return;
        
        // Remove all layers for this square (use loadedLayerNames = actual MAP_ names we added)
        const namesToRemove = cached.loadedLayerNames || cached.layers;
        for (const layerName of namesToRemove) {
            this.layers.removeRasterOverlay(squareId, layerName, true);  // Remove preview
            this.layers.removeRasterOverlay(squareId, layerName, false); // Remove full
        }
        
        // Remove labels
        this.layers.removeLabels(squareId);
        
        // Update state
        this.loadedSquares.delete(squareId);
        this.cache.delete(squareId);
        
        // Square unloaded
    }
    
    /**
     * Handle zoom level changes
     * @param {number} newZoom - New zoom level
     */
    onZoomChange(newZoom) {
        const oldZoom = this.currentZoom;
        this.currentZoom = newZoom;
        
        // Update label sizes
        this.layers.updateLabelSizes(newZoom);
        
        // Crossfade preview to full if needed
        if (oldZoom < this.config.CROSSFADE_THRESHOLD && newZoom >= this.config.CROSSFADE_THRESHOLD) {
            this._crossfadeAllPreviews();
        }
        
        // Update labels for all loaded squares
        for (const squareId of this.loadedSquares) {
            this._updateLabelsForSquare(squareId);
        }
    }
    
    /**
     * Crossfade all preview images to full resolution
     */
    _crossfadeAllPreviews() {
        for (const squareId of this.loadedSquares) {
            const cached = this.cache.get(squareId);
            if (!cached || !cached.hasPreview) continue;
            
            const layerNames = cached.loadedLayerNames || cached.layers;
            for (const layerName of layerNames) {
                const fullImageUrl = this._getImageUrl(squareId, layerName, false);
                this.layers.crossfadeToFull(squareId, layerName, fullImageUrl);
            }
        }
    }
    
    /**
     * Get loading statistics
     * @returns {Object} Loading statistics
     */
    getStats() {
        return {
            loadedSquares: this.loadedSquares.size,
            loadingQueue: this.loadingQueue.length,
            loadingInProgress: this.loadingSet.size,
            cacheSize: this.cache.size,
            viewportSquares: this.currentViewport ? this._calculateTargetSquares().length : 0
        };
    }
    
    /**
     * Clear all loaded content (cleanup)
     */
    clear() {
        // Clear loading state
        this.loadingQueue = [];
        this.loadingSet.clear();
        this.loadedSquares.clear();
        this.cache.clear();
        this.previewCache.clear();
        
        // Clear debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        
        // All content cleared
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapLoader;
}

