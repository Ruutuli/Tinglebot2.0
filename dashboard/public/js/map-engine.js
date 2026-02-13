// ============================================================================
// ------------------- Map Engine -------------------
// ============================================================================
// Main orchestration module for Leaflet image-space map.
// Dependencies (globals): L, MapGeometry, MapManifest, MapMetadata,
//   MapLayers, MapToggles, MapLoader, showSidebar, hideSidebar, toggleSidebar
// ============================================================================

class MapEngine {
    constructor(config) {
        this.config = config;
        this.map = null;
        this.isInitialized = false;
        this.isDestroyed = false;
        this.isAdmin = false;
        
        // Module instances
        this.geometry = null;
        this.manifest = null;
        this.layers = null;
        this.loader = null;
        this.toggles = null;
        
        // Event handlers
        this.eventHandlers = new Map();
        
        // Loading state
        this.initialLoadPromise = null;
        
        // Debounce timer for viewport changes (cleared in cleanup)
        this.viewportChangeTimer = null;
    }
    
    // ------------------- Initialization ------------------
    // initialize - Initialize the map engine
    async initialize(containerId = 'map') {
        if (this.isInitialized) {
            console.warn('[map-engine.js] Already initialized');
            return;
        }
        
        if (this.isDestroyed) {
            throw new Error('Cannot initialize destroyed map engine');
        }
        
        try {
            this._createModules();

            if (typeof this.metadata.loadFromAPI === 'function') {
                await this.metadata.loadFromAPI();
            }
            
            this._initializeLeaflet(containerId);
            await this._waitForMapReady();
            this._initializeModules();
            await this._loadManifest();
            this._setupEventHandlers();
            this.toggles.enableAutoSave();
            this.toggles.createKeyboardShortcuts();
            this._loadInitialViewport();
            this.isInitialized = true;
        } catch (error) {
            console.error('[map-engine.js] Initialization failed:', error);
            this.isInitialized = false;
            this.cleanup();
            throw error;
        }
    }
    
    // _createModules - Create module instances
    _createModules() {
        this.geometry = new MapGeometry(this.config);
        this.manifest = new MapManifest(this.config, this.geometry);
        this.metadata = new MapMetadata();
        
        this.geometry.setMetadata(this.metadata);
    }
    
    // _initializeLeaflet - Initialize Leaflet map with CRS.Simple
    _initializeLeaflet(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Map container not found: ${containerId}`);
        }
        
        container.innerHTML = '';
        
        this.map = L.map(container, {
            crs: L.CRS.Simple,
            minZoom: this.config.MIN_ZOOM,
            maxZoom: this.config.MAX_ZOOM,
            zoomControl: true,
            attributionControl: false,
            preferCanvas: false,
            renderer: L.svg({ pane: 'overlayPane' })
        });
        
        const h5Center = [
            (6664 + 8330) / 2,  // Y center: 7497
            (16800 + 19200) / 2 // X center: 18000
        ];
        
        this.map.setView(h5Center, -1);
        const bounds = L.latLngBounds(
            [0, 0],
            [this.config.CANVAS_H, this.config.CANVAS_W]
        );
        this.map.setMaxBounds(bounds);
        this.map.fitToCanvas = () => {
            const bounds = L.latLngBounds(
                [0, 0],
                [this.config.CANVAS_H, this.config.CANVAS_W]
            );
            this.map.fitBounds(bounds);
        };
    }
    
    // _waitForMapReady - Wait for map to be fully ready
    async _waitForMapReady() {
        return new Promise((resolve) => {
            if (this.map && this.map.getContainer()) {
                resolve();
            } else {
                setTimeout(() => {
                    this._waitForMapReady().then(resolve);
                }, 50);
            }
        });
    }
    
    // _initializeModules - Create layers, toggles, loader with map reference
    _initializeModules() {
        this.layers = new MapLayers(this.config, this.geometry);
        this.layers.initialize(this.map);
        this.toggles = new MapToggles(this.config, this.layers);
        
        if (this.isAdmin) {
            this.toggles.isAdmin = true;
        }
        
        this.loader = new MapLoader(this.config, this.geometry, this.manifest, this.layers, this.metadata);
        this.loader.initialize();
    }
    
    // _loadManifest - Load map manifest
    async _loadManifest() {
        await this.manifest.load();
    }
    
    // ------------------- Viewport ------------------
    // _boundsToViewport - Convert Leaflet bounds to internal coordinate system
    _boundsToViewport(bounds) {
        return {
            x0: bounds.getWest(),
            y0: this.config.CANVAS_H - bounds.getNorth(),
            x1: bounds.getEast(),
            y1: this.config.CANVAS_H - bounds.getSouth()
        };
    }
    
    // ------------------- Event Handlers ------------------
    // _setupEventHandlers - Attach map events and store refs for cleanup
    _setupEventHandlers() {
        const handleViewportChange = () => {
            const bounds = this.map.getBounds();
            const zoom = this.map.getZoom();
            this.loader.updateViewport(this._boundsToViewport(bounds), zoom);
        };
        
        const debouncedViewportChange = () => {
            if (this.viewportChangeTimer) {
                clearTimeout(this.viewportChangeTimer);
            }
            this.viewportChangeTimer = setTimeout(handleViewportChange, 50);
        };
        
        const zoomendHandler = () => {
            this.loader.onZoomChange(this.map.getZoom());
            debouncedViewportChange();
        };
        
        this.map.on('moveend', debouncedViewportChange);
        this.map.on('zoomend', zoomendHandler);
        
        this.eventHandlers.set('moveend', debouncedViewportChange);
        this.eventHandlers.set('zoomend', zoomendHandler);
    }
    
    // ------------------- Viewport ------------------
    // _loadInitialViewport - Trigger initial viewport load
    _loadInitialViewport() {
        const bounds = this.map.getBounds();
        const zoom = this.map.getZoom();
        this.loader.updateViewport(this._boundsToViewport(bounds), zoom);
    }

    // ------------------- Base Image ------------------
    // replaceBaseImageForSquare - Replace MAP_0002_Map-Base for loaded square with custom URL
    replaceBaseImageForSquare(squareId, imageUrl) {
        if (!this.loader || !this.layers || !this.loader.loadedSquares || !this.loader.loadedSquares.has(squareId)) return;
        this.layers.removeRasterOverlay(squareId, 'MAP_0002_Map-Base', true);
        this.layers.removeRasterOverlay(squareId, 'MAP_0002_Map-Base', false);
        this.layers.addRasterOverlay(squareId, 'MAP_0002_Map-Base', imageUrl, false);
    }

    // ------------------- Map Access ------------------
    // getMap - Get Leaflet map instance
    getMap() {
        return this.map;
    }
    
    // getModules - Get geometry, manifest, layers, loader, toggles
    getModules() {
        return {
            geometry: this.geometry,
            manifest: this.manifest,
            layers: this.layers,
            loader: this.loader,
            toggles: this.toggles,
        };
    }
    
    // getLoadingProgress - Get manifest and loader stats
    getLoadingProgress() {
        return {
            manifest: this.manifest.getLoadingProgress(),
            loader: this.loader.getStats()
        };
    }
    
    // getToggleState - Get current toggle states
    getToggleState() {
        return this.toggles.getState();
    }
    
    // setToggleState - Set toggle states
    setToggleState(state) {
        this.toggles.setStates(state);
    }
    
    // jumpToSquare - Pan and zoom to specific square
    jumpToSquare(squareId, zoom = 3) {
        if (!this.geometry.isValidSquareId(squareId)) {
            console.error('[map-engine.js] Invalid square ID:', squareId);
            return;
        }
        
        const bounds = this.geometry.getSquareBounds(squareId);
        const center = [
            this.config.CANVAS_H - (bounds.y0 + this.config.SQUARE_H / 2),
            bounds.x0 + this.config.SQUARE_W / 2
        ];
        
        this.map.setView(center, zoom);
    }
    
    // fitToCanvas - Fit map to show entire canvas
    fitToCanvas() {
        if (this.map && this.map.fitToCanvas) {
            this.map.fitToCanvas();
        }
    }
    
    // jumpToCoordinates - Pan and zoom to x,y
    jumpToCoordinates(x, y, zoom = 3) {
        const center = [y, x];
        this.map.setView(center, zoom);
    }
    
    // setToggleUIVisible - Show or hide sidebar
    setToggleUIVisible(visible) {
        if (visible) {
            showSidebar();
        } else {
            hideSidebar();
        }
    }
    
    // toggleToggleUI - Toggle sidebar visibility
    toggleToggleUI() {
        toggleSidebar();
    }
    
    // addEventListener - Add map event listener
    addEventListener(event, handler) {
        if (this.map) {
            this.map.on(event, handler);
        }
    }
    
    // removeEventListener - Remove map event listener
    removeEventListener(event, handler) {
        if (this.map) {
            this.map.off(event, handler);
        }
    }
    
    // getViewportBounds - Get bounds in internal coordinate system
    getViewportBounds() {
        return this._boundsToViewport(this.map.getBounds());
    }
    
    // getZoom - Get current zoom level
    getZoom() {
        return this.map.getZoom();
    }
    
    // setZoom - Set zoom level
    setZoom(zoom) {
        this.map.setZoom(zoom);
    }
    
    // getCenter - Get current center {x, y}
    getCenter() {
        const center = this.map.getCenter();
        return {
            x: center.lng,
            y: center.lat
        };
    }
    
    // setCenter - Set map center point
    setCenter(x, y) {
        this.map.setView([y, x], this.map.getZoom());
    }
    
    // hitTest - Get square and quadrant for point
    hitTest(x, y) {
        const square = this.geometry.hitTestSquare(x, y);
        const quadrant = this.geometry.hitTestQuadrant(x, y);
        
        return {
            square,
            quadrant,
            coordinates: { x, y }
        };
    }
    
    // getLoadedSquares - Get array of loaded square IDs
    getLoadedSquares() {
        return Array.from(this.loader.loadedSquares);
    }
    
    // getSquareMetadata - Get status and region for square
    getSquareMetadata(squareId) {
        return this.geometry.getSquareMetadata(squareId);
    }
    
    // isExplorable - Check if square is explorable
    isExplorable(squareId) {
        return this.geometry.isExplorable(squareId);
    }
    
    // isInaccessible - Check if square is inaccessible
    isInaccessible(squareId) {
        return this.geometry.isInaccessible(squareId);
    }
    
    // getRegion - Get region name for square
    getRegion(squareId) {
        return this.geometry.getRegion(squareId);
    }
    
    // getStatus - Get status for square
    getStatus(squareId) {
        return this.geometry.getStatus(squareId);
    }
    
    // getSquaresByRegion - Get square IDs in region
    getSquaresByRegion(region) {
        return this.metadata.getSquaresByRegion(region);
    }
    
    // getSquaresByStatus - Get square IDs with status
    getSquaresByStatus(status) {
        return this.metadata.getSquaresByStatus(status);
    }
    
    // getRegions - Get all unique region names
    getRegions() {
        return this.metadata.getRegions();
    }
    
    // getStatuses - Get all unique status values
    getStatuses() {
        return this.metadata.getStatuses();
    }
    
    // reloadViewport - Force reload of current viewport
    reloadViewport() {
        const bounds = this.getViewportBounds();
        const zoom = this.getZoom();
        
        this.loader.updateViewport(bounds, zoom);
    }
    
    // clearAndReload - Clear loaded content and reload viewport
    clearAndReload() {
        this.loader.clear();
        this.reloadViewport();
    }
    
    // getDebugInfo - Get debug information object
    getDebugInfo() {
        return {
            initialized: this.isInitialized,
            destroyed: this.isDestroyed,
            config: this.config,
            viewport: this.getViewportBounds(),
            zoom: this.getZoom(),
            center: this.getCenter(),
            loadedSquares: this.getLoadedSquares(),
            toggleState: this.getToggleState(),
        };
    }
    
    // logDebugInfo - Log debug information to console
    logDebugInfo() {
        console.group('[map-engine.js] Debug Information');
        const info = this.getDebugInfo();
        
        for (const [key, value] of Object.entries(info)) {
            if (typeof value === 'object') {
                console.log(key + ':', value);
            } else {
                console.log(key + ':', value);
            }
        }
        
        console.groupEnd();
    }
    
    // ------------------- Cleanup ------------------
    // cleanup - Destroy map engine and clear references
    cleanup() {
        if (this.isDestroyed) {
            return;
        }
        
        if (this.viewportChangeTimer) {
            clearTimeout(this.viewportChangeTimer);
            this.viewportChangeTimer = null;
        }
        
        if (this.map) {
            this.eventHandlers.forEach((handler, event) => {
                this.map.off(event, handler);
            });
            this.eventHandlers.clear();
        }
        
        if (this.loader) {
            this.loader.clear();
        }
        
        if (this.layers) {
            this.layers.clear();
        }
        
        if (this.toggles) {
            this.toggles.cleanup();
        }
        
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        
        this.geometry = null;
        this.manifest = null;
        this.layers = null;
        this.loader = null;
        this.toggles = null;
        this.metadata = null;
        this.initialLoadPromise = null;
        
        this.isInitialized = false;
        this.isDestroyed = true;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapEngine;
}
