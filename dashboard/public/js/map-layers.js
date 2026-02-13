/**
 * Map Layers - Manage Leaflet panes, z-index, and layer groups
 * Handles grid vectors, labels, and raster overlays with proper z-ordering
 */


class MapLayers {
    constructor(config, geometry) {
        this.config = config;
        this.geometry = geometry;
        this.map = null;
        this.panes = new Map();
        this.layerGroups = new Map();
        this.labelMarkers = new Map();
        this.gridLayer = null;
        this.quadrantCrossLayer = null;
        
        // Z-index values for panes (higher = on top)
        this.zIndexValues = {
            'quadrant-labels': 700,
            'square-labels': 600,
            'grid-lines': 500,
            'region-names': 400,
            'village-markers': 380,  // Above village borders
            'village-borders-inner': 360,  // Inner village borders (pink)
            'village-borders-outer': 350,  // Outer village borders (cyan)
            'region-borders': 300,
            'paths': 250,
            'mask': 200,        // Fog/hidden areas - above blight
            'blight': 150,      // Blight areas - above base
            'base': 100,        // Base map - below blight
            'background': 50
        };
    }
    
    /**
     * Initialize layers and panes for the map
     * @param {L.Map} map - Leaflet map instance
     */
    initialize(map) {
        this.map = map;
        this._createPanes();
        this._createGridLayer();
        this._createQuadrantCrossLayer();
        this._createLayerGroups();
        
        // Layers initialized
    }
    
    /**
     * Create Leaflet panes with proper z-index ordering
     */
    _createPanes() {
        for (const layerName of this.config.LAYER_ORDER) {
            const zIndex = this.zIndexValues[layerName];
            
            // Create pane if it doesn't exist
            if (!this.map.getPane(layerName)) {
                this.map.createPane(layerName);
            }
            
            const pane = this.map.getPane(layerName);
            pane.style.zIndex = zIndex;
            
            // Make grid and labels non-interactive
            if (layerName.includes('grid') || layerName.includes('labels')) {
                pane.style.pointerEvents = 'none';
            }
            
            this.panes.set(layerName, pane);
        }
    }
    
    /**
     * Create grid lines layer
     */
    _createGridLayer() {
        this.gridLayer = L.layerGroup();
        this._drawGridLines();
        
        // Add to map immediately (grid should always be visible by default)
        if (this.map) {
            this.map.addLayer(this.gridLayer);
        }
    }
    
    /**
     * Draw grid lines (vertical and horizontal)
     */
    _drawGridLines() {
        const { CANVAS_W, CANVAS_H, SQUARE_W, SQUARE_H, GRID_COLS, GRID_ROWS } = this.config;
        
        // Vertical lines: 11 lines to separate 10 columns (A-J)
        // Lines at x=0, x=2400, x=4800, ..., x=24000
        for (let i = 0; i <= GRID_COLS.length; i++) {
            const x = i * SQUARE_W;
            const line = L.polyline(
                [[0, x], [CANVAS_H, x]],
                {
                    color: '#ffffff',
                    weight: 2,
                    opacity: 1.0,
                    interactive: false,
                    pane: 'grid-lines'
                }
            );
            this.gridLayer.addLayer(line);
        }
        
        // Horizontal lines: 13 lines to separate 12 rows (1-12)
        // Lines at y=0, y=1666, y=3332, ..., y=19992
        for (let i = 0; i <= GRID_ROWS.length; i++) {
            const y = i * SQUARE_H;
            const line = L.polyline(
                [[y, 0], [y, CANVAS_W]],
                {
                    color: '#ffffff',
                    weight: 2,
                    opacity: 1.0,
                    interactive: false,
                    pane: 'grid-lines'
                }
            );
            this.gridLayer.addLayer(line);
        }
    }
    
    /**
     * Create quadrant cross layer (short ticks within squares)
     */
    _createQuadrantCrossLayer() {
        this.quadrantCrossLayer = L.layerGroup();
        this._drawQuadrantCrosses();
        
        // Add to map immediately (should be visible by default)
        if (this.map) {
            this.map.addLayer(this.quadrantCrossLayer);
        }
    }
    
    /**
     * Draw quadrant cross lines (full square crosses) - dotted lines
     */
    _drawQuadrantCrosses() {
        const { GRID_COLS, GRID_ROWS, SQUARE_W, SQUARE_H } = this.config;
        const tickLength = Math.min(SQUARE_W, SQUARE_H); // Full square dimension
        
        for (let colIndex = 0; colIndex < GRID_COLS.length; colIndex++) {
            for (let rowIndex = 0; rowIndex < GRID_ROWS.length; rowIndex++) {
                const squareId = this.geometry.generateSquareId(colIndex, rowIndex);
                const bounds = this.geometry.getSquareBounds(squareId);
                
                // Center point
                const centerX = bounds.x0 + SQUARE_W / 2;
                const centerY = bounds.y0 + SQUARE_H / 2;
                
                // Horizontal quadrant line (full width of square) - DOTTED
                const hTick = L.polyline(
                    [[centerY, bounds.x0], [centerY, bounds.x1]],
                    {
                        color: '#ffffff',
                        weight: 1,
                        opacity: 0.3,
                        dashArray: '5, 5',
                        interactive: false,
                        pane: 'grid-lines'
                    }
                );
                this.quadrantCrossLayer.addLayer(hTick);
                
                // Vertical quadrant line (full height of square) - DOTTED
                const vTick = L.polyline(
                    [[bounds.y0, centerX], [bounds.y1, centerX]],
                    {
                        color: '#ffffff',
                        weight: 1,
                        opacity: 0.3,
                        dashArray: '5, 5',
                        interactive: false,
                        pane: 'grid-lines'
                    }
                );
                this.quadrantCrossLayer.addLayer(vTick);
            }
        }
    }
    
    /**
     * Create layer groups for raster overlays
     */
    _createLayerGroups() {
        const rasterLayers = [
            // Base map layers
            'MAP_0002_Map-Base', 
            'MAP_0001_hidden-areas',
            'MAP_0000_BLIGHT',
            'MAP_0001s_0003_Region-Borders',
            'MAP_0001s_0004_REGIONS-NAMES',
            
            // Individual village marker layers (controlled by village-markers toggle)
            'MAP_0001s_0000_Rudania-Marker',
            'MAP_0001s_0001_Inariko-Marker', 
            'MAP_0001s_0002_Vhintl-Marker',
            
            // Village circle layers (handled separately - not as individual raster layers)
            // 'MAP_0002s_0000s_0000_CIRCLE-INARIKO-CYAN',
            // 'MAP_0002s_0000s_0001_CIRCLE-INARIKO-PINK',
            // 'MAP_0002s_0001s_0000_CIRCLE-VHINTL-CYAN',
            // 'MAP_0002s_0001s_0001_CIRCLE-VHINTL-PINK',
            // 'MAP_0002s_0002s_0000_CIRCLE-RUDANIA-CYAN',
            // 'MAP_0002s_0002s_0001_CIRCLE-RUDANIA-PINK',
            
            // Individual path layers (controlled by paths toggle)
            'MAP_0003s_0000_PSL',  // Path of Scarlet Leaves
            'MAP_0003s_0001_LDW',  // Leaf Dew Way
            'MAP_0003s_0002_Other-Paths'  // Other Paths
        ];
        
        for (const layerName of rasterLayers) {
            const layerGroup = L.layerGroup();
            this.layerGroups.set(layerName, layerGroup);
            
            // Add layer group to map so it can be displayed
            layerGroup.addTo(this.map);
        }
        
        // Create layer groups for village border layers
        const villageBorderLayers = [
            'MAP_0002s_0000s_0000_CIRCLE-INARIKO-CYAN',
            'MAP_0002s_0000s_0001_CIRCLE-INARIKO-PINK',
            'MAP_0002s_0001s_0000_CIRCLE-VHINTL-CYAN',
            'MAP_0002s_0001s_0001_CIRCLE-VHINTL-PINK',
            'MAP_0002s_0002s_0000_CIRCLE-RUDANIA-CYAN',
            'MAP_0002s_0002s_0001_CIRCLE-RUDANIA-PINK'
        ];
        
        for (const layerName of villageBorderLayers) {
            const layerGroup = L.layerGroup();
            this.layerGroups.set(layerName, layerGroup);
            
            // Add layer group to map so it can be displayed
            layerGroup.addTo(this.map);
        }
    }
    
    /**
     * Add raster overlay for a square
     * @param {string} squareId - Square ID
     * @param {string} layerName - Layer name
     * @param {string} imageUrl - Image URL
     * @param {boolean} isPreview - Whether this is a preview image
     * @returns {L.ImageOverlay} The created overlay
     */
    addRasterOverlay(squareId, layerName, imageUrl, isPreview = false) {
        const layerGroup = this.layerGroups.get(layerName);
        if (!layerGroup) {
            console.warn('[layers] Unknown layer:', layerName);
            return null;
        }
        
        // Map layer names to pane names
        const paneMap = {
            'MAP_0002_Map-Base': 'base',
            'MAP_0001_hidden-areas': 'mask',
            'MAP_0000_BLIGHT': 'blight',
            'MAP_0001s_0003_Region-Borders': 'region-borders',
            'paths': 'paths',
            'village-borders': 'village-borders',
            'region-names': 'region-names',
            'MAP_0001s_0004_REGIONS-NAMES': 'region-names',
            // Village marker layers
            'MAP_0001s_0000_Rudania-Marker': 'village-markers',
            'MAP_0001s_0001_Inariko-Marker': 'village-markers',
            'MAP_0001s_0002_Vhintl-Marker': 'village-markers',
            // Village circle layers (map to separate inner/outer panes)
            'MAP_0002s_0000s_0000_CIRCLE-INARIKO-CYAN': 'village-borders-outer',
            'MAP_0002s_0000s_0001_CIRCLE-INARIKO-PINK': 'village-borders-inner',
            'MAP_0002s_0001s_0000_CIRCLE-VHINTL-CYAN': 'village-borders-outer',
            'MAP_0002s_0001s_0001_CIRCLE-VHINTL-PINK': 'village-borders-inner',
            'MAP_0002s_0002s_0000_CIRCLE-RUDANIA-CYAN': 'village-borders-outer',
            'MAP_0002s_0002s_0001_CIRCLE-RUDANIA-PINK': 'village-borders-inner',
            // Path layers (map to paths pane)
            'MAP_0003s_0000_PSL': 'paths',
            'MAP_0003s_0001_LDW': 'paths',
            'MAP_0003s_0002_Other-Paths': 'paths'
        };
        
        const paneName = paneMap[layerName] || 'base'; // Default to 'base' pane
        
        const bounds = this.geometry.getSquareBounds(squareId);
        // Flip Y coordinates so A1 is at top-left (0,0) in Leaflet's CRS.Simple
        const leafletBounds = [
            [this.config.CANVAS_H - bounds.y1, bounds.x0], 
            [this.config.CANVAS_H - bounds.y0, bounds.x1]
        ];
        
        const overlay = L.imageOverlay(imageUrl, leafletBounds, {
            opacity: 0,
            pane: paneName,
            interactive: false,
            className: `map-overlay ${layerName} ${isPreview ? 'preview' : 'full'}`
        });
        
        // Store reference for later removal
        const key = `${squareId}-${layerName}`;
        overlay._mapKey = key;
        overlay._isPreview = isPreview;
        
        layerGroup.addLayer(overlay);
        
        // For fog layer, ensure it's visible immediately to prevent base map showing through
        if (layerName === 'MAP_0001_hidden-areas') {
            overlay.setOpacity(1); // Show immediately without fade
        } else {
            // Fade in other layers
            this._fadeInOverlay(overlay);
        }
        
        return overlay;
    }
    
    /**
     * Remove raster overlay for a square
     * @param {string} squareId - Square ID
     * @param {string} layerName - Layer name
     * @param {boolean} isPreview - Whether to remove preview or full image
     */
    removeRasterOverlay(squareId, layerName, isPreview = false) {
        const layerGroup = this.layerGroups.get(layerName);
        if (!layerGroup) return;
        
        const key = `${squareId}-${layerName}`;
        
        layerGroup.eachLayer(overlay => {
            if (overlay._mapKey === key && overlay._isPreview === isPreview) {
                this._fadeOutOverlay(overlay, () => {
                    layerGroup.removeLayer(overlay);
                });
                return; // Exit early since we found the overlay
            }
        });
    }
    
    /**
     * Crossfade from preview to full image
     * @param {string} squareId - Square ID
     * @param {string} layerName - Layer name
     * @param {string} fullImageUrl - Full resolution image URL
     */
    crossfadeToFull(squareId, layerName, fullImageUrl) {
        const layerGroup = this.layerGroups.get(layerName);
        if (!layerGroup) return;
        
        const key = `${squareId}-${layerName}`;
        let previewOverlay = null;
        let fullOverlay = null;
        
        // Find existing preview overlay
        layerGroup.eachLayer(overlay => {
            if (overlay._mapKey === key && overlay._isPreview) {
                previewOverlay = overlay;
                return; // Exit early since we found the overlay
            }
        });
        
        if (!previewOverlay) {
            // No preview to crossfade from, just add full image
            this.addRasterOverlay(squareId, layerName, fullImageUrl, false);
            return;
        }
        
        // Create full overlay (use same pane mapping as addRasterOverlay so z-order is correct)
        const paneMap = {
            'MAP_0002_Map-Base': 'base',
            'MAP_0001_hidden-areas': 'mask',
            'MAP_0000_BLIGHT': 'blight',
            'MAP_0001s_0003_Region-Borders': 'region-borders',
            'MAP_0001s_0004_REGIONS-NAMES': 'region-names',
            'MAP_0001s_0000_Rudania-Marker': 'village-markers',
            'MAP_0001s_0001_Inariko-Marker': 'village-markers',
            'MAP_0001s_0002_Vhintl-Marker': 'village-markers',
            'MAP_0002s_0000s_0000_CIRCLE-INARIKO-CYAN': 'village-borders-outer',
            'MAP_0002s_0000s_0001_CIRCLE-INARIKO-PINK': 'village-borders-inner',
            'MAP_0002s_0001s_0000_CIRCLE-VHINTL-CYAN': 'village-borders-outer',
            'MAP_0002s_0001s_0001_CIRCLE-VHINTL-PINK': 'village-borders-inner',
            'MAP_0002s_0002s_0000_CIRCLE-RUDANIA-CYAN': 'village-borders-outer',
            'MAP_0002s_0002s_0001_CIRCLE-RUDANIA-PINK': 'village-borders-inner',
            'MAP_0003s_0000_PSL': 'paths',
            'MAP_0003s_0001_LDW': 'paths',
            'MAP_0003s_0002_Other-Paths': 'paths'
        };
        const paneName = paneMap[layerName] || 'base';
        const bounds = this.geometry.getSquareBounds(squareId);
        // Flip Y coordinates so A1 is at top-left (0,0) in Leaflet's CRS.Simple
        const leafletBounds = [
            [this.config.CANVAS_H - bounds.y1, bounds.x0], 
            [this.config.CANVAS_H - bounds.y0, bounds.x1]
        ];
        
        fullOverlay = L.imageOverlay(fullImageUrl, leafletBounds, {
            opacity: 0,
            pane: paneName,
            interactive: false,
            className: `map-overlay ${layerName} full`
        });
        
        fullOverlay._mapKey = key;
        fullOverlay._isPreview = false;
        
        layerGroup.addLayer(fullOverlay);
        
        // Crossfade animation
        this._crossfadeOverlays(previewOverlay, fullOverlay, () => {
            layerGroup.removeLayer(previewOverlay);
        });
    }
    
    /**
     * Add square label (A1...J12)
     * @param {string} squareId - Square ID
     */
    addSquareLabel(squareId) {
        const bounds = this.geometry.getSquareBounds(squareId);
        
        // Get the exact center of the square using geometry method
        const center = this.geometry.getSquareCenter(squareId);
        
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'square-label';
        labelDiv.textContent = squareId;
        labelDiv.style.cssText = `
            position: absolute;
            pointer-events: none;
            font-family: 'Segoe UI', sans-serif;
            font-weight: bold;
            text-align: center;
            color: #ffffff;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8), 0 0 8px rgba(0, 0, 0, 0.5);
            z-index: 600;
            font-size: 32px;
            line-height: 1;
            white-space: nowrap;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
        `;
        
        // Create marker with Leaflet coordinate system: [lat, lng] = [y, x]
        // Flip Y coordinate so A1 is at top-left
        const marker = L.marker([this.config.CANVAS_H - center.y, center.x], {
            icon: L.divIcon({
                html: labelDiv,
                className: 'square-label-marker',
                iconSize: [120, 120],
                iconAnchor: [60, 60]  // Exactly half of iconSize for perfect centering
            }),
            pane: 'square-labels',
            interactive: false
        });
        
        this.labelMarkers.set(squareId, marker);
        marker.addTo(this.map);
        
        return marker;
    }
    
    /**
     * Quadrant status -> label text color (exploring map model). Matches explore party page and legend.
     */
    _quadrantStatusTextColors() {
        return {
            inaccessible: '#1a1a1a',
            unexplored: '#b91c1c',
            explored: '#ca8a04',
            secured: '#15803d'
        };
    }

    /**
     * Get the DOM element that shows "Q1"/"Q2"/etc (Leaflet 1.9.4 uses _icon; no getElement).
     * @param {L.Marker} marker
     * @returns {HTMLElement|null}
     */
    _getQuadrantLabelElement(marker) {
        const icon = marker._icon;
        if (!icon) return null;
        return icon.querySelector('.quadrant-label') || icon.firstElementChild || null;
    }

    /**
     * Set text color and white outline on the quadrant label element (matches explore party page).
     * @param {HTMLElement} labelEl
     * @param {string} color
     */
    _setQuadrantLabelColor(labelEl, color) {
        if (!labelEl) return;
        labelEl.style.setProperty('color', color, 'important');
        labelEl.style.setProperty('-webkit-text-fill-color', color, 'important');
        labelEl.style.setProperty('-webkit-text-stroke', '1px white', 'important');
        labelEl.style.setProperty('paint-order', 'stroke fill', 'important');
    }

    /**
     * Fetch quadrant statuses from API (exploring map model) and apply text color to labels only.
     * @param {string} squareId - Square ID
     * @param {L.Marker[]} quadrantMarkers - Array of 4 markers (Q1-Q4)
     */
    _applyQuadrantLabelColors(squareId, quadrantMarkers) {
        const base = (typeof window !== 'undefined' && window.__NEXT_DATA__?.basePath) || '';
        const apiBase = base.replace(/\/$/, '');
        const url = `${apiBase}/api/explore/map-quadrant-statuses?square=${encodeURIComponent(squareId)}`;
        const self = this;
        fetch(url, { cache: 'no-store' })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                const statuses = (data && data.quadrantStatuses) || {};
                const colors = self._quadrantStatusTextColors();
                quadrantMarkers.forEach(function(marker, i) {
                    const qId = 'Q' + (i + 1);
                    const status = statuses[qId] || 'unexplored';
                    const color = colors[status] || colors.unexplored;
                    const labelEl = self._getQuadrantLabelElement(marker);
                    self._setQuadrantLabelColor(labelEl, color);
                });
            })
            .catch(function() {});
    }

    /**
     * Add quadrant labels for a square (Q1-Q4 at quadrant corners). Text color by status from exploring map model.
     * @param {string} squareId - Square ID
     */
    addQuadrantLabels(squareId) {
        const quadrantMarkers = [];
        const defaultTextColor = this._quadrantStatusTextColors().unexplored;
        const baseStyle = [
            'position: absolute;',
            'pointer-events: none;',
            'font-family: \'Segoe UI\', sans-serif;',
            'font-weight: bold;',
            'text-align: center;',
            'text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8), 0 0 8px rgba(0, 0, 0, 0.5);',
            '-webkit-text-stroke: 1px white;',
            'paint-order: stroke fill;',
            'z-index: 700;',
            'font-size: 20px;',
            'line-height: 1;',
            'white-space: nowrap;',
            'display: flex;',
            'align-items: center;',
            'justify-content: center;',
            'width: 100%;',
            'height: 100%;'
        ].join(' ');

        for (let quadrant = 1; quadrant <= 4; quadrant++) {
            const corner = this.geometry.getQuadrantCorner(squareId, quadrant);
            const qText = 'Q' + quadrant;
            const html = '<div class="quadrant-label" style="' + baseStyle + '">' + qText + '</div>';

            const marker = L.marker([this.config.CANVAS_H - corner.y, corner.x], {
                icon: L.divIcon({
                    html: html,
                    className: 'quadrant-label-marker',
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                }),
                pane: 'quadrant-labels',
                interactive: false
            });

            quadrantMarkers.push(marker);
            marker.addTo(this.map);
            // Apply default color immediately so CSS doesn't override (API will update when loaded)
            const labelEl = this._getQuadrantLabelElement(marker);
            this._setQuadrantLabelColor(labelEl, defaultTextColor);
        }

        this.labelMarkers.set(squareId + '-quadrants', quadrantMarkers);
        this._applyQuadrantLabelColors(squareId, quadrantMarkers);
        return quadrantMarkers;
    }
    
    /**
     * Remove labels for a square
     * @param {string} squareId - Square ID
     */
    removeLabels(squareId) {
        // Remove square label
        const squareMarker = this.labelMarkers.get(squareId);
        if (squareMarker) {
            this.map.removeLayer(squareMarker);
            this.labelMarkers.delete(squareId);
        }
        
        // Remove quadrant labels
        const quadrantMarkers = this.labelMarkers.get(`${squareId}-quadrants`);
        if (quadrantMarkers) {
            quadrantMarkers.forEach(marker => {
                this.map.removeLayer(marker);
            });
            this.labelMarkers.delete(`${squareId}-quadrants`);
        }
    }
    
    /**
     * Remove all labels from the map
     */
    removeAllLabels() {
        // Removing all labels
        
        for (const [key, marker] of this.labelMarkers) {
            if (Array.isArray(marker)) {
                // Quadrant markers
                for (const m of marker) {
                    this.map.removeLayer(m);
                }
            } else {
                // Square marker
                this.map.removeLayer(marker);
            }
        }
        this.labelMarkers.clear();
        
        // All labels removed
    }
    
    /**
     * Update label font sizes based on zoom level
     * @param {number} zoom - Current zoom level
     */
    updateLabelSizes(zoom) {
        const squareLabelSize = this._getFontSize(this.config.FONT_SIZES.squareLabels, zoom);
        const quadrantLabelSize = this._getFontSize(this.config.FONT_SIZES.quadrantLabels, zoom);
        
        // Update existing square labels
        this.labelMarkers.forEach((marker, key) => {
            if (!key.includes('-quadrants')) {
                const div = (marker.getElement && marker.getElement()) || marker._icon;
                if (div) {
                    const squareLabel = div.querySelector && div.querySelector('.square-label');
                    if (squareLabel) squareLabel.style.fontSize = `${squareLabelSize}px`;
                }
            }
        });
        
        // Update existing quadrant labels
        this.labelMarkers.forEach((markers, key) => {
            if (key.includes('-quadrants') && Array.isArray(markers)) {
                markers.forEach(marker => {
                    const div = (marker.getElement && marker.getElement()) || marker._icon;
                    if (div) {
                        const quadrantLabel = div.querySelector && div.querySelector('.quadrant-label');
                        if (quadrantLabel) quadrantLabel.style.fontSize = `${quadrantLabelSize}px`;
                    }
                });
            }
        });
    }
    
    /**
     * Get font size for current zoom level (tiered sizing)
     * @param {Object} sizeMap - Font size mapping
     * @param {number} zoom - Current zoom
     * @returns {number} Font size in pixels
     */
    _getFontSize(sizeMap, zoom) {
        // Handle string keys (negative zoom levels) and numeric keys
        const levels = Object.keys(sizeMap).map(key => {
            const num = Number(key);
            return isNaN(num) ? key : num;
        }).sort((a, b) => {
            const numA = Number(a);
            const numB = Number(b);
            return numA - numB;
        });
        
        // Find the appropriate size for current zoom level
        for (let i = levels.length - 1; i >= 0; i--) {
            const level = Number(levels[i]);
            if (zoom >= level) {
                return sizeMap[levels[i]];
            }
        }
        
        // Return smallest size if zoom is below all thresholds
        return sizeMap[levels[0]] || 12;
    }
    
    /**
     * Set layer group visibility
     * @param {string} layerName - Layer name
     * @param {boolean} visible - Visibility state
     */
    setLayerVisibility(layerName, visible) {
        if (!this.map) {
            console.warn('[layers] Map not initialized');
            return;
        }
        
        // Fog/hidden areas layer is permanent and cannot be toggled off
        if (layerName === 'MAP_0001_hidden-areas') {
            return;
        }
        
        // Map generic toggle names to specific MAP_ layer names
        const toggleToLayerMap = {
            'base': 'MAP_0002_Map-Base',
            'blight': 'MAP_0000_BLIGHT',
            'region-borders': 'MAP_0001s_0003_Region-Borders',
            'region-names': 'MAP_0001s_0004_REGIONS-NAMES',
            'mask': 'MAP_0001_hidden-areas'
        };
        
        const actualLayerName = toggleToLayerMap[layerName] || layerName;
        
        // Handle village-markers toggle by controlling all individual marker layers
        if (layerName === 'village-markers') {
            const markerLayers = [
                'MAP_0001s_0000_Rudania-Marker',
                'MAP_0001s_0001_Inariko-Marker', 
                'MAP_0001s_0002_Vhintl-Marker'
            ];
            
            markerLayers.forEach(markerLayer => {
                const layerGroup = this.layerGroups.get(markerLayer);
                if (layerGroup) {
                    if (visible) {
                        this.map.addLayer(layerGroup);
                    } else {
                        this.map.removeLayer(layerGroup);
                    }
                }
            });
            return;
        }
        
        // Handle village-borders-inner toggle by controlling pink circle layers
        if (layerName === 'village-borders-inner') {
            const innerCircleLayers = [
                'MAP_0002s_0000s_0001_CIRCLE-INARIKO-PINK',
                'MAP_0002s_0001s_0001_CIRCLE-VHINTL-PINK',
                'MAP_0002s_0002s_0001_CIRCLE-RUDANIA-PINK'
            ];
            
            innerCircleLayers.forEach(circleLayer => {
                const layerGroup = this.layerGroups.get(circleLayer);
                if (layerGroup) {
                    if (visible) {
                        this.map.addLayer(layerGroup);
                    } else {
                        this.map.removeLayer(layerGroup);
                    }
                }
            });
            return;
        }
        
        // Handle village-borders-outer toggle by controlling cyan circle layers
        if (layerName === 'village-borders-outer') {
            const outerCircleLayers = [
                'MAP_0002s_0000s_0000_CIRCLE-INARIKO-CYAN',
                'MAP_0002s_0001s_0000_CIRCLE-VHINTL-CYAN',
                'MAP_0002s_0002s_0000_CIRCLE-RUDANIA-CYAN'
            ];
            
            outerCircleLayers.forEach(circleLayer => {
                const layerGroup = this.layerGroups.get(circleLayer);
                if (layerGroup) {
                    if (visible) {
                        this.map.addLayer(layerGroup);
                    } else {
                        this.map.removeLayer(layerGroup);
                    }
                }
            });
            return;
        }
        
        // Handle paths toggle by controlling all path layers
        if (layerName === 'paths') {
            const pathLayers = [
                'MAP_0003s_0000_PSL',  // Path of Scarlet Leaves
                'MAP_0003s_0001_LDW',  // Leaf Dew Way
                'MAP_0003s_0002_Other-Paths'  // Other Paths
            ];
            
            pathLayers.forEach(pathLayer => {
                const layerGroup = this.layerGroups.get(pathLayer);
                if (layerGroup) {
                    if (visible) {
                        this.map.addLayer(layerGroup);
                    } else {
                        this.map.removeLayer(layerGroup);
                    }
                }
            });
            return;
        }
        
        // Handle individual path layers
        if (layerName === 'MAP_0003s_0000_PSL' || layerName === 'MAP_0003s_0001_LDW' || layerName === 'MAP_0003s_0002_Other-Paths') {
            const layerGroup = this.layerGroups.get(layerName);
            if (layerGroup) {
                if (visible) {
                    this.map.addLayer(layerGroup);
                } else {
                    this.map.removeLayer(layerGroup);
                }
            }
            return;
        }
        
        const layerGroup = this.layerGroups.get(actualLayerName);
        if (layerGroup) {
            if (visible) {
                this.map.addLayer(layerGroup);
            } else {
                this.map.removeLayer(layerGroup);
            }
        }
    }
    
    /**
     * Set fog layer visibility (admin-only)
     * @param {boolean} visible - Visibility state
     */
        setFogVisibility(visible) {
            if (!this.map) {
                console.warn('[layers] Map not initialized');
                return;
            }
            
            // Find all fog layer overlays and set their opacity
            this.map.eachLayer(layer => {
                if (layer._mapKey && layer._mapKey.includes('MAP_0001_hidden-areas')) {
                    if (visible) {
                        layer.setOpacity(1);
                    } else {
                        layer.setOpacity(0);
                    }
                }
            });
        }

        setExplorationVisibility(visible) {
            if (!this.map) {
                console.warn('[layers] Map not initialized');
                return;
            }
            
            // Find all exploration markers and set their visibility
            this.map.eachLayer(layer => {
                if (layer._explorationMarker) {
                    if (visible) {
                        layer.setOpacity(1);
                    } else {
                        layer.setOpacity(0);
                    }
                }
            });
        }
    
    /**
     * Set grid visibility
     * @param {boolean} visible - Visibility state
     */
    setGridVisibility(visible) {
        if (!this.map || !this.gridLayer) {
            console.warn('[layers] Map or grid layer not initialized');
            return;
        }
        
        if (visible) {
            // Only add if not already on the map
            if (!this.map.hasLayer(this.gridLayer)) {
                this.map.addLayer(this.gridLayer);
            }
        } else {
            this.map.removeLayer(this.gridLayer);
        }
    }
    
    /**
     * Set quadrant cross visibility
     * @param {boolean} visible - Visibility state
     */
    setQuadrantCrossVisibility(visible) {
        if (!this.map || !this.quadrantCrossLayer) {
            console.warn('[layers] Map or quadrant cross layer not initialized');
            return;
        }
        
        if (visible) {
            // Only add if not already on the map
            if (!this.map.hasLayer(this.quadrantCrossLayer)) {
                this.map.addLayer(this.quadrantCrossLayer);
            }
        } else {
            this.map.removeLayer(this.quadrantCrossLayer);
        }
    }
    
    /**
     * Set square labels visibility
     * @param {boolean} visible - Visibility state
     */
    setSquareLabelsVisibility(visible) {
        if (!this.map) {
            console.warn('[layers] Map not initialized');
            return;
        }
        
        // Toggle square labels by controlling the square-labels pane
        const pane = this.map.getPane('square-labels');
        if (pane) {
            pane.style.display = visible ? 'block' : 'none';
        }
    }
    
    /**
     * Set quadrant labels visibility
     * @param {boolean} visible - Visibility state
     */
    setQuadrantLabelsVisibility(visible) {
        if (!this.map) {
            console.warn('[layers] Map not initialized');
            return;
        }
        
        // Toggle quadrant labels by controlling the quadrant-labels pane
        const pane = this.map.getPane('quadrant-labels');
        if (pane) {
            pane.style.display = visible ? 'block' : 'none';
        }
    }
    
    /**
     * Fade in overlay
     * @param {L.ImageOverlay} overlay - Overlay to fade in
     */
    _fadeInOverlay(overlay) {
        let opacity = 0;
        const fadeStep = 16 / this.config.FADE_MS; // 60fps
        
        const fadeIn = () => {
            opacity += fadeStep;
            if (opacity >= 1) {
                overlay.setOpacity(1);
            } else {
                overlay.setOpacity(opacity);
                requestAnimationFrame(fadeIn);
            }
        };
        
        requestAnimationFrame(fadeIn);
    }
    
    /**
     * Fade out overlay
     * @param {L.ImageOverlay} overlay - Overlay to fade out
     * @param {Function} callback - Callback when fade complete
     */
    _fadeOutOverlay(overlay, callback) {
        let opacity = 1;
        const fadeStep = 16 / this.config.FADE_MS; // 60fps
        
        const fadeOut = () => {
            opacity -= fadeStep;
            if (opacity <= 0) {
                overlay.setOpacity(0);
                callback();
            } else {
                overlay.setOpacity(opacity);
                requestAnimationFrame(fadeOut);
            }
        };
        
        requestAnimationFrame(fadeOut);
    }
    
    /**
     * Crossfade between two overlays
     * @param {L.ImageOverlay} previewOverlay - Preview overlay (fading out)
     * @param {L.ImageOverlay} fullOverlay - Full overlay (fading in)
     * @param {Function} callback - Callback when crossfade complete
     */
    _crossfadeOverlays(previewOverlay, fullOverlay, callback) {
        let previewOpacity = 1;
        let fullOpacity = 0;
        const fadeStep = 16 / this.config.FADE_MS; // 60fps
        
        const crossfade = () => {
            previewOpacity -= fadeStep;
            fullOpacity += fadeStep;
            
            if (previewOpacity <= 0 && fullOpacity >= 1) {
                previewOverlay.setOpacity(0);
                fullOverlay.setOpacity(1);
                callback();
            } else {
                previewOverlay.setOpacity(Math.max(0, previewOpacity));
                fullOverlay.setOpacity(Math.min(1, fullOpacity));
                requestAnimationFrame(crossfade);
            }
        };
        
        requestAnimationFrame(crossfade);
    }
    
    /**
     * Animate village markers fade in/out
     * @param {boolean} visible - Whether to show or hide markers
     */
    _animateVillageMarkers(visible) {
        const markerLayers = [
            'MAP_0001s_0000_Rudania-Marker',
            'MAP_0001s_0001_Inariko-Marker', 
            'MAP_0001s_0002_Vhintl-Marker'
        ];
        
        if (visible) {
            // Fade in: Add layers first, then animate opacity
            markerLayers.forEach(markerLayer => {
                const layerGroup = this.layerGroups.get(markerLayer);
                if (layerGroup && !this.map.hasLayer(layerGroup)) {
                    this.map.addLayer(layerGroup);
                    
                    // Set initial opacity to 0 and animate to 1
                    layerGroup.setOpacity(0);
                    this._fadeInLayerGroup(layerGroup);
                }
            });
        } else {
            // Fade out: Animate opacity to 0, then remove layers
            markerLayers.forEach(markerLayer => {
                const layerGroup = this.layerGroups.get(markerLayer);
                if (layerGroup && this.map.hasLayer(layerGroup)) {
                    this._fadeOutLayerGroup(layerGroup, () => {
                        this.map.removeLayer(layerGroup);
                    });
                }
            });
        }
    }
    
    /**
     * Fade in a layer group with scale animation
     * @param {L.LayerGroup} layerGroup - Layer group to fade in
     */
    _fadeInLayerGroup(layerGroup) {
        let opacity = 0;
        let scale = 0.8; // Start slightly smaller
        const fadeStep = 16 / this.config.FADE_MS; // 60fps
        const scaleStep = 0.2 / (this.config.FADE_MS / 16); // Scale to 1.0
        
        const fadeIn = () => {
            opacity += fadeStep;
            scale += scaleStep;
            
            if (opacity >= 1 && scale >= 1) {
                layerGroup.setOpacity(1);
                layerGroup.setStyle({ transform: 'scale(1)' });
            } else {
                layerGroup.setOpacity(Math.min(1, opacity));
                layerGroup.setStyle({ 
                    transform: `scale(${Math.min(1, scale)})`,
                    transition: 'transform 0.1s ease-out'
                });
                requestAnimationFrame(fadeIn);
            }
        };
        
        requestAnimationFrame(fadeIn);
    }
    
    /**
     * Fade out a layer group with scale animation
     * @param {L.LayerGroup} layerGroup - Layer group to fade out
     * @param {Function} callback - Callback when fade complete
     */
    _fadeOutLayerGroup(layerGroup, callback) {
        let opacity = 1;
        let scale = 1.0; // Start at normal size
        const fadeStep = 16 / this.config.FADE_MS; // 60fps
        const scaleStep = 0.2 / (this.config.FADE_MS / 16); // Scale down to 0.8
        
        const fadeOut = () => {
            opacity -= fadeStep;
            scale -= scaleStep;
            
            if (opacity <= 0 && scale <= 0.8) {
                layerGroup.setOpacity(0);
                layerGroup.setStyle({ transform: 'scale(0.8)' });
                callback();
            } else {
                layerGroup.setOpacity(Math.max(0, opacity));
                layerGroup.setStyle({ 
                    transform: `scale(${Math.max(0.8, scale)})`,
                    transition: 'transform 0.1s ease-in'
                });
                requestAnimationFrame(fadeOut);
            }
        };
        
        requestAnimationFrame(fadeOut);
    }
    
    /**
     * Clear all layers (cleanup)
     */
    clear() {
        // Clear layer groups
        this.layerGroups.forEach(layerGroup => {
            this.map.removeLayer(layerGroup);
            layerGroup.clearLayers();
        });
        
        // Clear labels
        this.labelMarkers.forEach(marker => {
            if (Array.isArray(marker)) {
                marker.forEach(m => this.map.removeLayer(m));
            } else {
                this.map.removeLayer(marker);
            }
        });
        this.labelMarkers.clear();
        
        // Clear grid layers
        if (this.gridLayer) {
            this.map.removeLayer(this.gridLayer);
            this.gridLayer.clearLayers();
        }
        
        if (this.quadrantCrossLayer) {
            this.map.removeLayer(this.quadrantCrossLayer);
            this.quadrantCrossLayer.clearLayers();
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapLayers;
}

